import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, publicQuery } from "./middleware";
import { assertRateLimit } from "./lib/rate-limit";
import { crmChatPoll, crmChatSend, crmWorkingHours } from "./lib/crm-chat";

/**
 * Чат-виджет на сайте: тонкий проксирующий слой к CRM.
 *
 * Отвечает НЕ этот сервер, а бот CRM (D:\CRM, messengers/websiteChat.ts) — тот же,
 * что ведёт WhatsApp, Instagram и Telegram. Здесь сознательно нет ни модели, ни
 * промтов, ни истории переписки: второй «чат-бот для сайта» означал бы второй
 * характер, второй набор правил и второе место, где чинить одну и ту же ошибку.
 *
 * Зачем прокси, а не прямой запрос из браузера в CRM: ключ интеграции
 * (CRM_LEAD_API_KEY) обязан остаться на сервере. Заодно здесь стоит ограничитель
 * по IP посетителя — CRM видит один адрес (наш сервер) и такой защиты дать не может.
 */

/** Тот же формат, что проверяет CRM (WEBSITE_SESSION_RE): случайный идентификатор
 *  вкладки, который сайт хранит в браузере посетителя. Совпадение проверок с обеих
 *  сторон намеренное — расходиться им нельзя. */
const sessionId = z.string().regex(/^[a-zA-Z0-9_-]{16,64}$/, "Неверная сессия чата");

export const chatRouter = createRouter({
  /** Посетитель отправил сообщение — возвращаем реплики бота (может быть пусто,
   *  если диалог ведёт живой агент: его ответ придёт следующим опросом). */
  send: publicQuery
    .input(
      z.object({
        sessionId,
        text: z.string().trim().min(1, "Пустое сообщение").max(2000),
        pageUrl: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Живой человек пишет несколько сообщений в минуту, не сотню. Предел щедрый:
      // цена ошибки здесь — оборванный разговор с настоящим клиентом.
      assertRateLimit(ctx.req, "chat-send", 30, 5 * 60 * 1000, "Слишком много сообщений подряд. Немного подождите.");

      const result = await crmChatSend(input);
      if (!result) {
        throw new TRPCError({
          code: "SERVICE_UNAVAILABLE",
          // Текст видит посетитель — он должен понимать, что делать дальше, а не
          // читать «ошибка сервиса». Сохраняем существующий путь обратного звонка.
          message: "Чат сейчас недоступен. Позвоните нам или оставьте номер — перезвоним.",
        });
      }
      return result;
    }),

  /** Что нового в диалоге: ответы бота и — главное — реплики живого агента,
   *  который подхватил разговор из CRM. */
  poll: publicQuery
    .input(z.object({ sessionId, after: z.string().max(40).optional() }))
    .query(async ({ input, ctx }) => {
      // Опрос идёт раз в несколько секунд, пока окно чата открыто, — предел выше
      // остальных и считается по своему ведру, чтобы не съедать лимит отправки.
      assertRateLimit(ctx.req, "chat-poll", 240, 5 * 60 * 1000, "Слишком частые запросы.");
      return (await crmChatPoll(input.sessionId, input.after)) ?? { messages: [], paused: false };
    }),

  /** Рабочее ли сейчас время у CRM — решает, что показывает кнопка «Перезвоните
   *  мне»: анимацию скорого звонка или обычную заявку. `false` при недоступности
   *  CRM — безопаснее занизить ожидания, чем обещать звонок, которого не будет. */
  workingHours: publicQuery.query(async () => ({ within: (await crmWorkingHours()) ?? false })),
});
