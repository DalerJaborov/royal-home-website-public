import { z } from "zod";
import * as cookie from "cookie";
import { TRPCError } from "@trpc/server";
import { Session } from "@contracts/constants";
import { getSessionCookieOptions } from "./lib/cookies";
import { createRouter, authedQuery, publicQuery } from "./middleware";
import { signSessionToken } from "./kimi/session";
import { findUserByEmail, findUserByUnionId, setTotpSecret, setTotpEnabled, bumpSessionVersion, consumePasswordResetToken, LOCAL_ADMIN_UNION_ID } from "./queries/users";
import { isDbAvailable } from "./queries/connection";
import { hashPassword, verifyPassword } from "./lib/password";
import { assertRateLimit } from "./lib/rate-limit";
import { env } from "./lib/env";
import { generateTotpSecret, generateTotpQrCode, verifyTotpCode } from "./lib/totp";
import { signPending2faToken, verifyPending2faToken } from "./lib/pending-2fa";

async function issueSessionCookie(
  ctx: { resHeaders: Headers; req: Request },
  unionId: string,
  sessionVersion: number,
) {
  const token = await signSessionToken({ unionId, clientId: env.appId || "local", sessionVersion });
  const cookieOpts = getSessionCookieOptions(ctx.req.headers);
  ctx.resHeaders.append(
    "set-cookie",
    cookie.serialize(Session.cookieName, token, {
      httpOnly: cookieOpts.httpOnly,
      path: cookieOpts.path,
      sameSite: cookieOpts.sameSite?.toLowerCase() as "lax" | "none",
      secure: cookieOpts.secure,
      maxAge: Session.maxAgeMs / 1000,
    }),
  );
}

// Timing-equalization dummy for login below: hashing/verifying against this
// when the email doesn't exist makes "no such user" take as long as "wrong
// password", so response time can't be used to enumerate valid emails.
const DUMMY_PASSWORD_HASH = hashPassword("timing-equalization-dummy");

export const authRouter = createRouter({
  // Explicit whitelist — the DB row also carries passwordHash and totpSecret,
  // which must never reach the client.
  // The public layout probes this on every visit. No session is a normal
  // state, not an authorization error; protected mutations still use authedQuery.
  me: publicQuery.query(({ ctx }) => ctx.user ? ({
    id: ctx.user.id,
    name: ctx.user.name,
    email: ctx.user.email,
    avatar: ctx.user.avatar,
    role: ctx.user.role,
    totpEnabled: ctx.user.totpEnabled,
  }) : null),

  // Standalone email+password login for the site's one admin account —
  // independent of the Kimi OAuth flow, so it works on any host. When TOTP
  // is enabled on the account, this only clears the password step and
  // returns a short-lived pendingToken instead of a session cookie;
  // loginVerifyTotp below does the rest.
  login: publicQuery
    .input(z.object({ email: z.string().email(), password: z.string().min(1).max(200) }))
    .mutation(async ({ input, ctx }) => {
      // Brute-force protection: 5 attempts per 5 minutes per IP
      assertRateLimit(ctx.req, "login", 5, 5 * 60 * 1000, "Слишком много попыток входа. Подождите 5 минут.");
      // Dev fallback: no DATABASE_URL configured yet — accept ADMIN_EMAIL/
      // ADMIN_PASSWORD (or the "admin@royalhome.tj" / "admin123" default) so
      // the login flow can be tested before a real DB exists. Never applies
      // in production (env.databaseUrl is required there, so this branch
      // can't be reached once deployed for real). TOTP needs persistence,
      // so it's simply unavailable on this dev-only path.
      if (!isDbAvailable() && !env.isProduction) {
        const devEmail = env.adminEmail || "admin@royalhome.tj";
        const devPassword = env.adminPassword || "admin123";
        if (input.email !== devEmail || input.password !== devPassword) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Неверный email или пароль" });
        }
        await issueSessionCookie(ctx, LOCAL_ADMIN_UNION_ID, 0);
        return { success: true };
      }

      const user = await findUserByEmail(input.email);
      if (!user || user.unionId !== LOCAL_ADMIN_UNION_ID || !user.passwordHash) {
        // Фиктивная проверка пароля, чтобы «email не найден» отвечал так же
        // долго, как «пароль не подошёл» — иначе по времени ответа можно
        // перебором выяснить, какие email существуют.
        verifyPassword(input.password, DUMMY_PASSWORD_HASH);
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Неверный email или пароль" });
      }
      if (!verifyPassword(input.password, user.passwordHash)) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Неверный email или пароль" });
      }

      if (user.totpEnabled) {
        const pendingToken = await signPending2faToken(user.unionId);
        return { success: false, requiresTotp: true, pendingToken };
      }

      await issueSessionCookie(ctx, user.unionId, user.sessionVersion);
      return { success: true, requiresTotp: false };
    }),

  // Step 2 of login when the account has TOTP enabled.
  loginVerifyTotp: publicQuery
    .input(z.object({ pendingToken: z.string(), code: z.string().min(6).max(6) }))
    .mutation(async ({ input, ctx }) => {
      assertRateLimit(ctx.req, "totp-login", 8, 5 * 60 * 1000, "Слишком много попыток. Подождите 5 минут.");

      const unionId = await verifyPending2faToken(input.pendingToken);
      if (!unionId) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Сессия входа истекла. Войдите заново." });
      }
      const user = await findUserByUnionId(unionId);
      if (!user || !user.totpEnabled || !user.totpSecret) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Двухфакторная аутентификация не настроена." });
      }
      if (!user.email || !verifyTotpCode(user.email, user.totpSecret, input.code)) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Неверный код" });
      }

      await issueSessionCookie(ctx, user.unionId, user.sessionVersion);
      return { success: true };
    }),

  // С3/security-audit-11-09.md: вторая половина аварийного сброса пароля —
  // ссылку (с токеном) выдаёт CRM через crm-sync-router.ts /admin-reset,
  // здесь директор, открыв её, ставит новый пароль сам. Публичная процедура
  // (нет сессии до того, как пароль сброшен), поэтому отдельный жёсткий
  // rate-limit — токен и так одноразовый и живёт 15 минут, но перебор с
  // короткими base64url-токенами всё равно не должен быть дешёвым.
  consumePasswordReset: publicQuery
    .input(z.object({ token: z.string().min(10).max(200), newPassword: z.string().min(8).max(200) }))
    .mutation(async ({ input, ctx }) => {
      assertRateLimit(ctx.req, "password-reset-consume", 10, 15 * 60 * 1000, "Слишком много попыток. Подождите 15 минут.");
      const result = await consumePasswordResetToken(input.token, input.newPassword);
      if (!result.ok) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Ссылка недействительна или истекла. Запросите новую." });
      }
      return { success: true };
    }),

  logout: authedQuery.mutation(async ({ ctx }) => {
    // Инкремент sessionVersion (С2/security-audit-11-09.md): отзывает
    // именно этот и все ранее выданные токены, а не только гасит cookie в
    // этом браузере — украденная копия токена тоже перестаёт работать.
    await bumpSessionVersion(ctx.user.unionId);
    const opts = getSessionCookieOptions(ctx.req.headers);
    ctx.resHeaders.append(
      "set-cookie",
      cookie.serialize(Session.cookieName, "", {
        httpOnly: opts.httpOnly,
        path: opts.path,
        sameSite: opts.sameSite?.toLowerCase() as "lax" | "none",
        secure: opts.secure,
        maxAge: 0,
      }),
    );
    return { success: true };
  }),

  // ── Two-factor setup (admin → Настройки → Безопасность) ──────────
  totpStatus: authedQuery.query(({ ctx }) => ({ enabled: ctx.user.totpEnabled })),

  // Generates a new secret and returns a QR code to scan. Doesn't require a
  // code yet — totpConfirm below turns enforcement on once the admin proves
  // the app is actually set up correctly.
  totpSetup: authedQuery.mutation(async ({ ctx }) => {
    if (!isDbAvailable()) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Требуется подключённая база данных." });
    }
    if (!ctx.user.email) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "У аккаунта не задан email." });
    }
    const secret = generateTotpSecret();
    await setTotpSecret(ctx.user.unionId, secret);
    const qrCodeDataUrl = await generateTotpQrCode(ctx.user.email, secret);
    return { qrCodeDataUrl, secret };
  }),

  totpConfirm: authedQuery
    .input(z.object({ code: z.string().min(6).max(6) }))
    .mutation(async ({ input, ctx }) => {
      const user = await findUserByUnionId(ctx.user.unionId);
      if (!user?.totpSecret || !user.email) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Сначала начните настройку 2FA." });
      }
      if (!verifyTotpCode(user.email, user.totpSecret, input.code)) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Неверный код. Проверьте время на телефоне и попробуйте снова." });
      }
      await setTotpEnabled(ctx.user.unionId, true);
      return { success: true };
    }),

  totpDisable: authedQuery
    .input(z.object({ password: z.string().min(1).max(200) }))
    .mutation(async ({ input, ctx }) => {
      const user = await findUserByUnionId(ctx.user.unionId);
      if (!user?.passwordHash || !verifyPassword(input.password, user.passwordHash)) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Неверный пароль" });
      }
      await setTotpEnabled(ctx.user.unionId, false);
      await setTotpSecret(ctx.user.unionId, null);
      return { success: true };
    }),
});
