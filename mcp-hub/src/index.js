import { loadConfig } from "./config.js";
import { openStore } from "./store.js";
import { createApp } from "./app.js";

const cfg = loadConfig();
const store = openStore(cfg.dataDir);
const app = createApp({ cfg, store });
setInterval(() => store.purgeExpired(), 10 * 60 * 1000).unref();

app.listen(cfg.port, "0.0.0.0", () => {
  console.log(JSON.stringify({ msg: "mcp-hub listening", port: cfg.port, publicUrl: cfg.publicUrl }));
});
