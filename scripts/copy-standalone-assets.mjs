import { cpSync, existsSync } from "node:fs";
import { resolve } from "node:path";

export function copyStandaloneSecurityWrapper({
  projectRoot = process.cwd(),
  distDir = process.env.NEXT_DIST_DIR || ".next",
} = {}) {
  // CLI packaging copies the wrapper explicitly after resolving its standalone layout.
  if (process.env.NEXT_TRACING_ROOT_MODE === "workspace") return;

  const standaloneDir = resolve(projectRoot, distDir, "standalone");
  const source = resolve(projectRoot, "custom-server.js");
  if (!existsSync(standaloneDir) || !existsSync(source)) return;
  cpSync(source, resolve(standaloneDir, "custom-server.js"), { force: true });
}

copyStandaloneSecurityWrapper();
