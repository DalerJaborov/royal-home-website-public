import * as jose from "jose";
import { env } from "../lib/env";
import { Session } from "@contracts/constants";
import type { SessionPayload } from "./types";

const JWT_ALG = "HS256";

export type VerifiedSession = SessionPayload & { issuedAtMs: number };

export async function signSessionToken(
  payload: SessionPayload,
): Promise<string> {
  const secret = new TextEncoder().encode(env.appSecret);
  return new jose.SignJWT(payload)
    .setProtectedHeader({ alg: JWT_ALG })
    .setIssuedAt()
    // С2/security-audit-11-09.md: было "1 year" без отзыва. См.
    // contracts/constants.ts Session.maxAgeMs — держать оба значения в
    // одном месте. ВАЖНО: jose трактует ЧИСЛО в setExpirationTime как
    // абсолютный unix-timestamp в секундах, а не длительность — отсюда
    // строка с суффиксом "s" (относительное время от setIssuedAt).
    .setExpirationTime(`${Math.floor(Session.maxAgeMs / 1000)}s`)
    .sign(secret);
}

export async function verifySessionToken(
  token: string,
): Promise<VerifiedSession | null> {
  if (!token) {
    console.warn("[session] No token provided for verification.");
    return null;
  }
  try {
    const secret = new TextEncoder().encode(env.appSecret);
    const { payload } = await jose.jwtVerify(token, secret, {
      algorithms: [JWT_ALG],
    });
    const { unionId, clientId, sessionVersion, iat } = payload;
    if (!unionId || !clientId || typeof sessionVersion !== "number" || !iat) {
      console.warn("[session] JWT payload missing required fields.");
      return null;
    }
    return { unionId, clientId, sessionVersion, issuedAtMs: iat * 1000 } as VerifiedSession;
  } catch (error) {
    console.warn("[session] JWT verification failed:", error);
    return null;
  }
}
