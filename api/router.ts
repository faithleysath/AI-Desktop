import { authRouter } from "./auth-router";
import { createRouter, publicQuery } from "./middleware";
import { sessionRouter } from "./edudesk/sessionRouter";
import { systemRouter } from "./edudesk/systemRouter";
import { dashboardRouter } from "./edudesk/dashboardRouter";
import { messageRouter } from "./edudesk/messageRouter";
import { examRouter } from "./edudesk/examRouter";
import { gradeRouter } from "./edudesk/gradeRouter";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,

  session: sessionRouter,
  system: systemRouter,
  dashboard: dashboardRouter,
  message: messageRouter,
  exam: examRouter,
  grade: gradeRouter,
});

export type AppRouter = typeof appRouter;
