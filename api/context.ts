import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import type { Account, User } from "@db/schema";
import * as cookie from "cookie";
import { EduSession } from "@contracts/apps";
import { authenticateRequest } from "./kimi/auth";
import { verifyAccountToken } from "./edudesk/session";
import { findAccountById } from "./queries/accounts";

export type TrpcContext = {
  req: Request;
  resHeaders: Headers;
  user?: User;
  /** 校园账号（用户名密码登录） */
  account?: Account;
};

export async function createContext(
  opts: FetchCreateContextFnOptions,
): Promise<TrpcContext> {
  const ctx: TrpcContext = { req: opts.req, resHeaders: opts.resHeaders };
  try {
    ctx.user = await authenticateRequest(opts.req.headers);
  } catch {
    // Authentication is optional here
  }
  try {
    const cookies = cookie.parse(opts.req.headers.get("cookie") ?? "");
    const token = cookies[EduSession.cookieName];
    if (token) {
      const accountId = await verifyAccountToken(token);
      if (accountId) {
        ctx.account = (await findAccountById(accountId)) ?? undefined;
      }
    }
  } catch {
    // Account session is optional here
  }
  return ctx;
}
