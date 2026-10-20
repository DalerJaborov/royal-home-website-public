import { eq, sql } from "drizzle-orm";
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import * as schema from "@db/schema";
import type { InsertUser } from "@db/schema";
import { getDb, isDbAvailable } from "./connection";
import { env } from "../lib/env";
import { hashPassword } from "../lib/password";

export const LOCAL_ADMIN_UNION_ID = "local-admin";

export async function findUserByEmail(email: string) {
  if (!isDbAvailable()) {
    return null;
  }
  const rows = await getDb()!
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);
  return rows.at(0) ?? null;
}

// Runs once on server boot. Creates the one admin account from
// ADMIN_EMAIL/ADMIN_PASSWORD env vars. ВАЖНО: пароль из env — только НАЧАЛЬНЫЙ.
// Для существующей записи passwordHash не трогаем — иначе сброс пароля из CRM
// (resetAdminPassword ниже) откатывался бы при каждом рестарте контейнера.
export async function ensureLocalAdmin() {
  if (!isDbAvailable()) return;
  if (!env.adminEmail || !env.adminPassword) {
    console.warn("[auth] ADMIN_EMAIL/ADMIN_PASSWORD not set — local admin login is disabled.");
    return;
  }
  const passwordHash = hashPassword(env.adminPassword);
  await getDb()!
    .insert(schema.users)
    .values({
      unionId: LOCAL_ADMIN_UNION_ID,
      name: "Администратор",
      email: env.adminEmail,
      passwordHash,
      role: "admin",
    })
    .onDuplicateKeyUpdate({ set: { email: env.adminEmail, role: "admin" } });
  console.log("[auth] Local admin account ready for", env.adminEmail);
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

const PASSWORD_RESET_TTL_MS = 15 * 60 * 1000;

/**
 * Аварийный сброс пароля админки — вызывается ТОЛЬКО из CRM (директором, за
 * step-up-подтверждением) через server-to-server канал crm-sync-router.
 *
 * С3/security-audit-11-09.md: раньше здесь генерировался новый пароль и
 * возвращался открытым текстом — утечка ключа CRM_SYNC_ADMIN_RESET_KEY или
 * взлом самой CRM означали мгновенный захват сайта одним запросом. Теперь
 * пароль здесь не трогается вообще: выдаётся одноразовый токен (в БД —
 * только его sha256, как с паролем), на который CRM собирает ссылку смены
 * пароля с TTL 15 минут; новый пароль вводит сам директор на сайте через
 * consumePasswordResetToken. 2FA этой функцией не снимается — resetTotp
 * только запоминается и применяется в момент, когда ссылкой ДЕЙСТВИТЕЛЬНО
 * воспользовались (не раньше — иначе истёкшая, так и не открытая ссылка
 * уже сняла бы защиту).
 */
export async function createPasswordResetToken(opts?: { resetTotp?: boolean }) {
  if (!isDbAvailable()) throw new Error("База данных недоступна");
  // 24 байта → 32 символа base64url: достаточно энтропии для одноразовой
  // ссылки, живущей 15 минут, без спецсимволов (удобно вставлять в URL).
  const token = randomBytes(24).toString("base64url");
  await getDb()!
    .update(schema.users)
    .set({
      passwordResetTokenHash: sha256Hex(token),
      passwordResetExpiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
      passwordResetClearsTotp: Boolean(opts?.resetTotp),
    })
    .where(eq(schema.users.unionId, LOCAL_ADMIN_UNION_ID));
  return { email: env.adminEmail ?? "admin@royalhome.tj", token };
}

/**
 * Вторая половина сброса: сам директор открывает ссылку с токеном и вводит
 * новый пароль. Проверяет хэш + срок, ставит новый passwordHash, гасит
 * токен (одноразовый — повторно использовать нельзя), отзывает все сессии
 * (bumpSessionVersion) и, если исходный запрос просил resetTotp, снимает
 * 2FA здесь же.
 */
export async function consumePasswordResetToken(token: string, newPassword: string) {
  if (!isDbAvailable()) throw new Error("База данных недоступна");
  const tokenHash = sha256Hex(token);
  const rows = await getDb()!
    .select()
    .from(schema.users)
    .where(eq(schema.users.unionId, LOCAL_ADMIN_UNION_ID))
    .limit(1);
  const user = rows.at(0);
  if (
    !user ||
    !user.passwordResetTokenHash ||
    !user.passwordResetExpiresAt ||
    user.passwordResetExpiresAt.getTime() < Date.now()
  ) {
    return { ok: false as const };
  }
  // timingSafeEqual требует буферы одинаковой длины — оба здесь всегда
  // 64-символьный hex sha256, но на случай повреждённых данных в БД падать
  // не хотим: несовпадение длины трактуем как несовпадение хэша.
  const a = Buffer.from(tokenHash);
  const b = Buffer.from(user.passwordResetTokenHash);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false as const };
  }

  await getDb()!
    .update(schema.users)
    .set({
      passwordHash: hashPassword(newPassword),
      passwordResetTokenHash: null,
      passwordResetExpiresAt: null,
      passwordResetClearsTotp: false,
      sessionVersion: sql`${schema.users.sessionVersion} + 1`,
      ...(user.passwordResetClearsTotp ? { totpSecret: null, totpEnabled: false } : {}),
    })
    .where(eq(schema.users.unionId, LOCAL_ADMIN_UNION_ID));
  return { ok: true as const };
}

export async function findUserByUnionId(unionId: string) {
  if (!isDbAvailable()) {
    // Fail closed in production: never fabricate an admin user when the DB is
    // down — let the caller surface an error instead (same guard as the dev
    // login fallback in auth-router.ts).
    if (env.isProduction) {
      throw new Error("Database unavailable — cannot resolve user");
    }
    // Dev fallback: return dummy admin user
    return {
      id: 1,
      unionId,
      name: "Администратор",
      email: "admin@royalhome.tj",
      passwordHash: null,
      avatar: null,
      role: "admin" as const,
      totpSecret: null,
      totpEnabled: false,
      sessionVersion: 0,
      passwordResetTokenHash: null,
      passwordResetExpiresAt: null,
      passwordResetClearsTotp: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignInAt: new Date(),
    };
  }

  const rows = await getDb()!
    .select()
    .from(schema.users)
    .where(eq(schema.users.unionId, unionId))
    .limit(1);
  return rows.at(0);
}

export async function upsertUser(data: InsertUser) {
  if (!isDbAvailable()) {
    // Dev fallback: no-op
    return;
  }

  const values = { ...data };
  const updateSet: Partial<InsertUser> = {
    lastSignInAt: new Date(),
    ...data,
  };

  if (
    values.role === undefined &&
    values.unionId &&
    values.unionId === env.ownerUnionId
  ) {
    values.role = "admin";
    updateSet.role = "admin";
  }

  await getDb()!
    .insert(schema.users)
    .values(values)
    .onDuplicateKeyUpdate({ set: updateSet });
}

// Stores a freshly generated secret without turning enforcement on yet —
// login doesn't require a code until setTotpEnabled(unionId, true) runs
// (after the admin confirms one code, proving the app is set up right).
export async function setTotpSecret(unionId: string, secret: string | null) {
  if (!isDbAvailable()) return;
  await getDb()!
    .update(schema.users)
    .set({ totpSecret: secret })
    .where(eq(schema.users.unionId, unionId));
}

export async function setTotpEnabled(unionId: string, enabled: boolean) {
  if (!isDbAvailable()) return;
  await getDb()!
    .update(schema.users)
    .set({ totpEnabled: enabled })
    .where(eq(schema.users.unionId, unionId));
}

/**
 * Отзывает ВСЕ ранее выданные сессии этого пользователя (С2/security-audit-
 * 11-09.md): инкрементирует sessionVersion, так что любой JWT с прежним
 * значением перестаёт проходить проверку в api/kimi/auth.ts, даже если его
 * срок ещё не истёк. Вызывается при logout и при смене/сбросе пароля.
 */
export async function bumpSessionVersion(unionId: string) {
  if (!isDbAvailable()) return;
  await getDb()!
    .update(schema.users)
    .set({ sessionVersion: sql`${schema.users.sessionVersion} + 1` })
    .where(eq(schema.users.unionId, unionId));
}
