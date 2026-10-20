import * as jose from "jose";
import { env } from "./env";

// Short-lived token proving "this request already passed the password
// check for this account" — issued after step 1 of login when TOTP is
// enabled, consumed by loginVerifyTotp in step 2. Deliberately separate
// from the real session token/cookie so it can't be mistaken for one.
const JWT_ALG = "HS256";
const PURPOSE = "totp-pending";

export async function signPending2faToken(unionId: string): Promise<string> {
  const secret = new TextEncoder().encode(env.appSecret);
  return new jose.SignJWT({ unionId, purpose: PURPOSE })
    .setProtectedHeader({ alg: JWT_ALG })
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(secret);
}

export async function verifyPending2faToken(token: string): Promise<string | null> {
  try {
    const secret = new TextEncoder().encode(env.appSecret);
    const { payload } = await jose.jwtVerify(token, secret, { algorithms: [JWT_ALG] });
    if (payload.purpose !== PURPOSE || typeof payload.unionId !== "string") return null;
    return payload.unionId;
  } catch {
    return null;
  }
}
