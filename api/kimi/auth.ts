import type { Context } from "hono";
import { setCookie } from "hono/cookie";
import * as jose from "jose";
import * as cookie from "cookie";
import { env } from "../lib/env";
import { getSessionCookieOptions } from "../lib/cookies";
import { Session } from "@contracts/constants";
import { Errors } from "@contracts/errors";
import { signSessionToken, verifySessionToken } from "./session";
import { users as kimiUsers } from "./platform";
import { findUserByUnionId, upsertUser } from "../queries/users";
import type { TokenResponse } from "./types";
import type { User } from "@db/schema";

async function exchangeAuthCode(
  code: string,
  redirectUri: string,
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: env.appId,
    redirect_uri: redirectUri,
    client_secret: env.appSecret,
  });

  const resp = await fetch(`${env.kimiAuthUrl}/api/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    // Без таймаута зависший ответ держал ВХОД: человек оставался на пустой
    // странице возврата с OAuth без единого объяснения и без возможности
    // повторить. 15 секунд — обмен кода на маркер, он либо быстрый, либо
    // не случится вовсе.
    signal: AbortSignal.timeout(15_000),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Token exchange failed (${resp.status}): ${text}`);
  }

  return resp.json() as Promise<TokenResponse>;
}

let jwks: ReturnType<typeof jose.createRemoteJWKSet> | null = null;
function getJwks() {
  if (!jwks) {
    jwks = jose.createRemoteJWKSet(
      new URL(`${env.kimiAuthUrl}/api/.well-known/jwks.json`),
    );
  }
  return jwks;
}

async function verifyAccessToken(
  accessToken: string,
): Promise<{ userId: string; clientId: string }> {
  const { payload } = await jose.jwtVerify(accessToken, getJwks());
  const userId = payload.user_id as string;
  const clientId = payload.client_id as string;
  if (!userId) {
    throw new Error("user_id missing from access token");
  }
  return { userId, clientId };
}

/**
 * Проверяет сессионную cookie и, опционально, продлевает её при активности
 * (С2/security-audit-11-09.md): токен живёт Session.maxAgeMs (12 часов); если
 * до истечения осталось меньше Session.refreshThresholdMs, здесь же
 * переиздаётся новый токен с тем же sessionVersion и свежим сроком — активный
 * админ никогда не видит разлогин, а забытая сессия гаснет сама. Продление
 * происходит только когда есть resHeaders, куда его можно записать (обычный
 * tRPC-запрос из createContext) — retryless-проверки без resHeaders (если
 * такие появятся) просто не продлевают.
 */
export async function authenticateRequest(
  headers: Headers,
  resHeaders?: Headers,
): Promise<User> {
  const cookies = cookie.parse(headers.get("cookie") || "");
  const token = cookies[Session.cookieName];
  if (!token) {
    throw Errors.forbidden("Invalid authentication token.");
  }
  const claim = await verifySessionToken(token);
  if (!claim) {
    throw Errors.forbidden("Invalid authentication token.");
  }
  const user = await findUserByUnionId(claim.unionId);
  if (!user) {
    throw Errors.forbidden("User not found. Please re-login.");
  }
  // Токен с прежним (меньшим) sessionVersion был выдан до logout или сброса
  // пароля — считается отозванным, даже если его срок жизни ещё не истёк.
  if (user.sessionVersion !== claim.sessionVersion) {
    console.warn("[auth] Session token revoked (sessionVersion mismatch).");
    throw Errors.forbidden("Session revoked. Please re-login.");
  }

  if (resHeaders) {
    const age = Date.now() - claim.issuedAtMs;
    if (age > Session.maxAgeMs - Session.refreshThresholdMs) {
      const freshToken = await signSessionToken({
        unionId: user.unionId,
        clientId: claim.clientId,
        sessionVersion: user.sessionVersion,
      });
      const cookieOpts = getSessionCookieOptions(headers);
      resHeaders.append(
        "set-cookie",
        cookie.serialize(Session.cookieName, freshToken, {
          httpOnly: cookieOpts.httpOnly,
          path: cookieOpts.path,
          sameSite: cookieOpts.sameSite?.toLowerCase() as "lax" | "none",
          secure: cookieOpts.secure,
          maxAge: Session.maxAgeMs / 1000,
        }),
      );
    }
  }

  return user;
}

export function createOAuthCallbackHandler() {
  return async (c: Context) => {
    const code = c.req.query("code");
    const state = c.req.query("state");
    const error = c.req.query("error");
    const errorDescription = c.req.query("error_description");

    if (error) {
      if (error === "access_denied") {
        return c.redirect("/", 302);
      }
      return c.json(
        { error, error_description: errorDescription },
        400,
      );
    }

    if (!code || !state) {
      return c.json({ error: "code and state are required" }, 400);
    }

    try {
      const redirectUri = atob(state);
      const tokenResp = await exchangeAuthCode(code, redirectUri);
      const { userId } = await verifyAccessToken(tokenResp.access_token);
      const userProfile = await kimiUsers.getProfile(tokenResp.access_token);
      if (!userProfile) {
        throw new Error("Failed to fetch user profile from Kimi Open");
      }

      await upsertUser({
        unionId: userId,
        name: userProfile.name,
        avatar: userProfile.avatar_url,
        lastSignInAt: new Date(),
      });

      // sessionVersion читается заново после upsert — если это возврат
      // логина после logout/сброса пароля, значение уже увеличено, и токен
      // должен нести АКТУАЛЬНОЕ значение, а не 0 по умолчанию.
      const freshUser = await findUserByUnionId(userId);
      const token = await signSessionToken({
        unionId: userId,
        clientId: env.appId,
        sessionVersion: freshUser?.sessionVersion ?? 0,
      });

      const cookieOpts = getSessionCookieOptions(c.req.raw.headers);
      setCookie(c, Session.cookieName, token, {
        ...cookieOpts,
        maxAge: Session.maxAgeMs / 1000,
      });

      return c.redirect("/", 302);
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      return c.json({ error: "OAuth callback failed" }, 500);
    }
  };
}

export { exchangeAuthCode, verifyAccessToken };
