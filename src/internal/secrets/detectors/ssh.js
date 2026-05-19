const SSH_PRIVATE_RE = /-----BEGIN OPENSSH PRIVATE KEY-----[\s\S]*?-----END OPENSSH PRIVATE KEY-----/g;

export default {
  id: "ssh_private_key",
  kind: "secret",
  severity: "critical",
  classification: null,
  scan(text) {
    return [...text.matchAll(SSH_PRIVATE_RE)].map((match) => ({
      start: match.index,
      end: match.index + match[0].length,
      match: match[0],
    }));
  },
};
