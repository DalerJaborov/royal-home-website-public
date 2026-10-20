import { ErrorMessages } from "@contracts/constants";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { env } from "./lib/env";
import { looksLikeConnectionFailure, markDbUnavailable } from "./queries/connection";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const createRouter = t.router;

/**
 * Production returns database failures without switching to demo fixtures.
 * Development can fall back to demo memory for reads after a connection failure;
 * mutations are never retried because they may already have caused side effects.
 */
const watchDbFailures = t.middleware(async ({ next, type }) => {
  const result = await next();
  if (result.ok || !looksLikeConnectionFailure(result.error)) return result;

  // A production outage must keep failing until MySQL recovers. Switching to
  // the dev fixtures advertises fictitious properties and loses lead/admin
  // writes while returning success. Do not permanently poison the DB state.
  if (env.isProduction) return result;

  markDbUnavailable(result.error);
  // A mutation may already have written data or contacted CRM before failing.
  // Retrying it can duplicate those side effects; only reads may be replayed.
  if (type !== "query") return result;
  // И сразу повторяем: getDb() теперь вернёт null, запрос уйдёт в память и
  // отработает. Без повтора первый запрос после сбоя всё равно отдавал 500 —
  // то есть посетитель, пришедший в момент падения базы, видел пустой сайт,
  // хотя данные для показа есть. Повтор ровно один: флаг уже выставлен,
  // второй раз сюда попасть невозможно.
  return next();
});

export const publicQuery = t.procedure.use(watchDbFailures);

const requireAuth = t.middleware(async (opts) => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: ErrorMessages.unauthenticated,
    });
  }

  return next({ ctx: { ...ctx, user: ctx.user } });
});

function requireRole(role: string) {
  return t.middleware(async (opts) => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== role) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: ErrorMessages.insufficientRole,
      });
    }

    return next({ ctx: { ...ctx, user: ctx.user } });
  });
}

// От publicQuery, а не от t.procedure: сторож подключения нужен и здесь —
// админские запросы падают на той же базе.
export const authedQuery = publicQuery.use(requireAuth);
export const adminQuery = authedQuery.use(requireRole("admin"));
