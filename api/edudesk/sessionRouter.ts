import * as cookie from "cookie";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { EduSession } from "@contracts/apps";
import { tenants } from "@db/schema";
import { getSessionCookieOptions } from "../lib/cookies";
import { getDb } from "../queries/connection";
import { findAccountByUsername } from "../queries/accounts";
import { createRouter, publicQuery, accountQuery } from "../middleware";
import { signAccountToken } from "./session";
import { verifyPassword } from "./password";

function serializeCookie(name: string, value: string, headers: Headers, maxAgeSec: number) {
  const opts = getSessionCookieOptions(headers);
  return cookie.serialize(name, value, {
    httpOnly: opts.httpOnly,
    path: opts.path,
    sameSite: opts.sameSite?.toLowerCase() as "lax" | "none",
    secure: opts.secure,
    maxAge: maxAgeSec,
  });
}

export const sessionRouter = createRouter({
  /** 当前登录账号 + 租户 */
  me: accountQuery.query(async ({ ctx }) => {
    const tenant = await getDb().query.tenants.findFirst({
      where: eq(tenants.id, ctx.account.tenantId),
    });
    return { account: ctx.account, tenant };
  }),

  /** 用户名密码登录（校园账号） */
  login: publicQuery
    .input(z.object({ username: z.string().min(1), password: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const acc = await findAccountByUsername(input.username);
      if (!acc || !verifyPassword(input.password, acc.passwordHash)) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "用户名或密码错误" });
      }
      const token = await signAccountToken(acc.id);
      ctx.resHeaders.append(
        "set-cookie",
        serializeCookie(EduSession.cookieName, token, ctx.req.headers, EduSession.maxAgeMs / 1000),
      );
      return { success: true };
    }),

  logout: accountQuery.mutation(({ ctx }) => {
    ctx.resHeaders.append(
      "set-cookie",
      serializeCookie(EduSession.cookieName, "", ctx.req.headers, 0),
    );
    return { success: true };
  }),
});
