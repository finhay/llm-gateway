// Per-user credential vault: AES-256-GCM, AAD binds ciphertext to (email, service)
// so a row cannot be swapped onto another user or service.
import crypto from "node:crypto";

export function createVault(key) {
  const aad = (email, service) => Buffer.from(`${email.toLowerCase()}|${service}`, "utf8");
  return {
    encrypt(email, service, plaintext) {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
      cipher.setAAD(aad(email, service));
      const ciphertext = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
      return { ciphertext, iv, tag: cipher.getAuthTag() };
    },
    decrypt(email, service, { ciphertext, iv, tag }) {
      const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAAD(aad(email, service));
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
    },
  };
}
