import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { APP_CATALOG } from "@contracts/apps";
import { accounts, tenantModules, userPrefs } from "@db/schema";
import { getDb } from "../queries/connection";
import { findAccountByUsername } from "../queries/accounts";
import { createRouter, accountQuery, adminAccountQuery } from "../middleware";
import { hashPassword } from "./password";

export const systemRouter = createRouter({
  /* ---------- 应用清单：按「租户 License × 角色」过滤下发 ---------- */
  visibleApps: accountQuery.query(async ({ ctx }) => {
    const rows = await getDb()
      .select()
      .from(tenantModules)
      .where(eq(tenantModules.tenantId, ctx.account.tenantId));
    const enabled = new Map(rows.map((r) => [r.moduleId, r.enabled]));
    return APP_CATALOG.filter(
      (a) => a.roles.includes(ctx.account.role) && (enabled.get(a.id) ?? false),
    );
  }),

  /* ---------- 桌面偏好（随账号漫游） ---------- */
  getPrefs: accountQuery.query(async ({ ctx }) => {
    const p = await getDb().query.userPrefs.findFirst({
      where: eq(userPrefs.accountId, ctx.account.id),
    });
    return { wallpaper: p?.wallpaper ?? 0, dockAutoHide: p?.dockAutoHide ?? true };
  }),

  setPrefs: accountQuery
    .input(
      z.object({
        wallpaper: z.number().int().min(0).max(2).optional(),
        dockAutoHide: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const patch: Record<string, unknown> = {};
      if (input.wallpaper !== undefined) patch.wallpaper = input.wallpaper;
      if (input.dockAutoHide !== undefined) patch.dockAutoHide = input.dockAutoHide;
      await getDb()
        .insert(userPrefs)
        .values({
          accountId: ctx.account.id,
          wallpaper: input.wallpaper ?? 0,
          dockAutoHide: input.dockAutoHide ?? true,
        })
        .onDuplicateKeyUpdate({ set: patch });
      return { success: true };
    }),

  /* ---------- 模块授权（分模块售卖，仅管理员） ---------- */
  listModules: adminAccountQuery.query(async ({ ctx }) => {
    const rows = await getDb()
      .select()
      .from(tenantModules)
      .where(eq(tenantModules.tenantId, ctx.account.tenantId));
    const enabled = new Map(rows.map((r) => [r.moduleId, r.enabled]));
    return APP_CATALOG.map((a) => ({
      id: a.id,
      name: a.name,
      icon: a.icon,
      color: a.color,
      desc: a.desc,
      cat: a.cat,
      enabled: enabled.get(a.id) ?? false,
    }));
  }),

  setModule: adminAccountQuery
    .input(z.object({ moduleId: z.string().min(1), enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      if (input.moduleId === "settings" && !input.enabled) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "系统设置为基础模块，不可关闭" });
      }
      await getDb()
        .insert(tenantModules)
        .values({ tenantId: ctx.account.tenantId, moduleId: input.moduleId, enabled: input.enabled })
        .onDuplicateKeyUpdate({ set: { enabled: input.enabled } });
      return { success: true };
    }),

  /* ---------- 用户管理（仅管理员） ---------- */
  listAccounts: adminAccountQuery.query(async ({ ctx }) => {
    return getDb()
      .select({
        id: accounts.id,
        username: accounts.username,
        name: accounts.name,
        role: accounts.role,
        createdAt: accounts.createdAt,
      })
      .from(accounts)
      .where(eq(accounts.tenantId, ctx.account.tenantId));
  }),

  createAccount: adminAccountQuery
    .input(
      z.object({
        username: z.string().min(2).max(64).regex(/^[a-zA-Z0-9_]+$/, "仅限字母、数字、下划线"),
        password: z.string().min(6, "密码至少 6 位"),
        name: z.string().min(1, "请填写姓名"),
        role: z.enum(["admin", "teacher", "student"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const exists = await findAccountByUsername(input.username);
      if (exists) {
        throw new TRPCError({ code: "CONFLICT", message: "用户名已存在" });
      }
      await getDb().insert(accounts).values({
        tenantId: ctx.account.tenantId,
        username: input.username,
        passwordHash: hashPassword(input.password),
        name: input.name,
        role: input.role,
      });
      return { success: true };
    }),
});
