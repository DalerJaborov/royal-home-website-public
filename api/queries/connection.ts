import { drizzle } from "drizzle-orm/mysql2";
import { env } from "../lib/env";
import * as schema from "@db/schema";
import * as relations from "@db/relations";

const fullSchema = { ...schema, ...relations };

let instance: ReturnType<typeof drizzle<typeof fullSchema>> | null = null;
let dbUnavailable = false;

export function getDb() {
  if (dbUnavailable) {
    if (env.isProduction) throw new Error("Database connection unavailable");
    return null;
  }
  if (!instance) {
    try {
      if (!env.databaseUrl || env.databaseUrl === "") {
        if (env.isProduction) throw new Error("DATABASE_URL is required in production");
        dbUnavailable = true;
        console.log("[DB] No DATABASE_URL set — using in-memory store");
        return null;
      }
      instance = drizzle(env.databaseUrl, {
        mode: "planetscale",
        schema: fullSchema,
      });
    } catch (e) {
      if (env.isProduction) throw e;
      dbUnavailable = true;
      // Причину обязательно в журнал: без неё «работает на памяти» выглядит
      // штатным режимом, и настоящая поломка подключения (неверный URL, упавший
      // сервер, истёкший пароль) остаётся невидимой до первой потери данных.
      console.error("[DB] Failed to connect — using in-memory store:", e instanceof Error ? e.message : e);
      return null;
    }
  }
  return instance;
}

export function isDbAvailable() {
  // Callers select the dev memory store when this returns false. Production
  // must never select it, even if a connection failed earlier in the process.
  if (env.isProduction) {
    if (!env.databaseUrl || dbUnavailable) throw new Error("Database connection unavailable");
    return true;
  }
  return !dbUnavailable && !!env.databaseUrl;
}

/**
 * Пометить базу недоступной по факту УПАВШЕГО ЗАПРОСА.
 *
 * Зачем отдельная функция: drizzle создаёт подключение лениво — `drizzle(url)`
 * выше не ходит в сеть и не бросает, поэтому catch вокруг него не срабатывает
 * НИКОГДА. Ошибка вылезает только на первом реальном запросе, к тому моменту
 * getDb() уже вернул объект, и запасной режим «работаем на памяти» оставался
 * мёртвым кодом: сайт вместо сохранённых данных показывал посетителю пустой
 * каталог, а разработчику без базы — пустоту и 500 в консоли.
 *
 * Только режим разработки: production не заменяет реальные данные фикстурами.
 */
export function markDbUnavailable(reason: unknown): void {
  if (env.isProduction) return;
  if (dbUnavailable) return;
  dbUnavailable = true;
  instance = null;
  console.error(
    "[DB] Запрос не прошёл — переходим на память:",
    reason instanceof Error ? reason.message : String(reason)
  );
}

/** Похоже ли на отказ подключения, а не на ошибку в самом запросе. */
export function looksLikeConnectionFailure(err: unknown): boolean {
  // Drizzle wraps SQL errors with the same "Failed query" prefix, including
  // syntax/constraint failures. Inspect the underlying connection cause.
  const visited = new Set<unknown>();
  let current = err;
  for (let depth = 0; current != null && depth < 8 && !visited.has(current); depth++) {
    visited.add(current);
    const value = current as { message?: unknown; code?: unknown; cause?: unknown };
    const text = typeof current === "object"
      ? `${value.code ?? ""} ${value.message ?? ""}`
      : String(current);
    if (/ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|EHOSTUNREACH|PROTOCOL_CONNECTION_LOST|ER_ACCESS_DENIED|ER_BAD_DB_ERROR|Access denied|Can't connect|Connection lost/i.test(text)) return true;
    current = typeof current === "object" ? value.cause : undefined;
  }
  return false;
}
