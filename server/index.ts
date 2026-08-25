import { websocket } from "hono/bun";
import homepage from "../index.html";
import { app } from "./app";
import { cleanupStaleFiles } from "./jobs";
import { attachRealtimeServer, startRealtimeBridge } from "./realtime";

const port = Number(process.env.PORT ?? 3000);

const server = Bun.serve({
  port,
  routes: {
    "/": homepage,
  },
  fetch: app.fetch,
  websocket,
});

attachRealtimeServer(server);
await startRealtimeBridge();
Bun.cron("@daily", () => cleanupStaleFiles()).unref();

console.log(`EduDesk listening on ${server.url}`);
