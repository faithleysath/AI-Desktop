import * as jose from "jose";
import { env } from "../lib/env";

const JWT_ALG = "HS256";

/** 校园账号会话 JWT（与平台 OAuth 会话相互独立） */
export async function signAccountToken(accountId: number): Promise<string> {
  const secret = new TextEncoder().encode(env.appSecret);
  return new jose.SignJWT({ accountId })
    .setProtectedHeader({ alg: JWT_ALG })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret);
}

export async function verifyAccountToken(token: string): Promise<number | null> {
  try {
    const secret = new TextEncoder().encode(env.appSecret);
    const { payload } = await jose.jwtVerify(token, secret, {
      algorithms: [JWT_ALG],
    });
    return typeof payload.accountId === "number" ? payload.accountId : null;
  } catch {
    return null;
  }
}
