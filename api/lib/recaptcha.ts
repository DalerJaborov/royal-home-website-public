// Verifies a reCAPTCHA v3 token against Google's siteverify endpoint. v3 has
// no checkbox/challenge — it just scores how bot-like the request looked
// (0 = bot, 1 = human) based on behavior, so this stays fully invisible to
// real visitors.
import { env } from "./env";
import { TRPCError } from "@trpc/server";

const MIN_SCORE = 0.5;

export function isRecaptchaConfigured() {
  return Boolean(process.env.RECAPTCHA_SECRET_KEY);
}

// Вызывается один раз при старте сервера (boot.ts) — предупреждает в логе,
// что капча выключена, вместо того чтобы это выяснилось только по всплеску
// спама в заявках. На каждый запрос это НЕ пишется: 1000 заявок в час дали
// бы 1000 одинаковых строк в логе и ничего не сказали бы сверх первой.
export function warnIfRecaptchaNotConfiguredAtBoot() {
  if (env.isProduction && !isRecaptchaConfigured()) {
    console.warn("[recaptcha] RECAPTCHA_SECRET_KEY пуст — формы заявок недоступны до настройки капчи");
  }
}

export async function verifyRecaptcha(token: string | undefined, remoteIp: string): Promise<boolean> {
  const secret = process.env.RECAPTCHA_SECRET_KEY;
  if (!secret) {
    // На проде без ключа отказываемся молча пропускать: до этой правки
    // пустой ключ означал "не настроено — не блокируем", что на практике
    // держало капчу выключенной месяцами без единого сигнала (С4). Вне
    // прода (dev/preview) ключа обычно и не бывает — там по-прежнему true,
    // иначе форма заявки не протестировать локально.
    if (!env.isProduction) return true;
    throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Форма временно недоступна. Позвоните нам или напишите в WhatsApp." });
  }
  // Missing tokens may be caused by blocked scripts. Show an honest retry
  // path instead of accepting an unverified submission or fake success.
  if (!token) throw new TRPCError({ code: "BAD_REQUEST", message: "Не удалось проверить форму. Обновите страницу и повторите или свяжитесь с нами в WhatsApp." });

  try {
    const res = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token, remoteip: remoteIp }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error("reCAPTCHA verification unavailable");
    const data = (await res.json()) as { success: boolean; score?: number; hostname?: string; action?: string };
    const validHost = data.hostname === "royalhome.tj" || data.hostname === "www.royalhome.tj";
    const validAction = ["callback_widget", "contact_lead", "home_banner_lead", "sell_lead"].includes(data.action ?? "");
    return data.success && (data.score ?? 0) >= MIN_SCORE && validHost && validAction;
  } catch {
    throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Проверка формы временно недоступна. Попробуйте ещё раз или свяжитесь с нами в WhatsApp." });
  }
}
