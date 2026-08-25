import { ErrorMessages } from "@contracts/constants";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { Account } from "@db/schema";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const createRouter = t.router;
export const publicQuery = t.procedure;

const requireAuth = t.middleware(async (opts) => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: ErrorMessages.unauthenticated,
    });
  }

  return next({ ctx: { ...ctx, user: ctx.user } });
});

function requireRole(role: string) {
  return t.middleware(async (opts) => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== role) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: ErrorMessages.insufficientRole,
      });
    }

    return next({ ctx: { ...ctx, user: ctx.user } });
  });
}

export const authedQuery = t.procedure.use(requireAuth);
export const adminQuery = authedQuery.use(requireRole("admin"));

/* ==================== EduDesk 校园账号过程 ==================== */

function requireAccountRoles(...roles: Account["role"][]) {
  return t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.account) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "请先登录" });
    }
    if (!roles.includes(ctx.account.role)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "没有权限执行此操作" });
    }
    return next({ ctx: { ...ctx, account: ctx.account } });
  });
}

/** 任意已登录校园账号 */
export const accountQuery = t.procedure.use(requireAccountRoles("admin", "teacher", "student"));
/** 管理员 */
export const adminAccountQuery = t.procedure.use(requireAccountRoles("admin"));
/** 教师及以上 */
export const teacherUpQuery = t.procedure.use(requireAccountRoles("admin", "teacher"));
/** 仅学生 */
export const studentQuery = t.procedure.use(requireAccountRoles("student"));
