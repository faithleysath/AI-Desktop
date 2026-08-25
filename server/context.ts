import type { MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Role } from "../contracts/apps";
import { db } from "../db/client";
import { auth } from "./auth";

export interface AccountContext {
  id: string;
  username: string;
  name: string;
  email: string;
  role: Role;
  organizationId: string;
  tenantId: string;
}

export type AppEnv = {
  Variables: {
    account: AccountContext;
  };
};

export async function accountFromHeaders(headers: Headers): Promise<AccountContext | null> {
  const session = await auth.api.getSession({ headers });
  if (!session) return null;
  let membershipQuery = db
    .selectFrom("member")
    .select(["organizationId", "role"])
    .where("userId", "=", session.user.id);
  if (session.session.activeOrganizationId) {
    membershipQuery = membershipQuery.where(
      "organizationId",
      "=",
      session.session.activeOrganizationId,
    );
  }
  const membership = await membershipQuery.orderBy("createdAt", "asc").executeTakeFirst();
  if (!membership) return null;
  return {
    id: session.user.id,
    username: session.user.username ?? session.user.email,
    name: session.user.name,
    email: session.user.email,
    role: membership.role,
    organizationId: membership.organizationId,
    tenantId: membership.organizationId,
  };
}

export const requireAccount: MiddlewareHandler<AppEnv> = async (c, next) => {
  const account = await accountFromHeaders(c.req.raw.headers);
  if (!account) throw new HTTPException(401, { message: "请先登录" });
  c.set("account", account);
  await next();
};

export function requireRoles(...roles: Role[]): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const account = c.get("account");
    if (!roles.includes(account.role)) {
      throw new HTTPException(403, { message: "没有权限执行此操作" });
    }
    await next();
  };
}
