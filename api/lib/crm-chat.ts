// Мост чат-виджета к CRM (отдельный проект, см. D:\CRM — вебхуки
// /api/v1/webhooks/website-chat). Ключ и адрес те же, что у заявок: это одна
// интеграция с одним доверенным сервером, а второй секрет означал бы второй
// способ его потерять. Не настроено — чат просто выключен, сайт работает как
// раньше (ровно тот же принцип, что в crm.ts).
const CRM_LEAD_URL = process.env.CRM_LEAD_URL;
const CRM_LEAD_API_KEY = process.env.CRM_LEAD_API_KEY;

/** Адрес соседнего вебхука на том же сервере CRM: .../website-lead → .../website-chat.
 *  Выводим из уже настроенного адреса, чтобы не заводить третью переменную окружения,
 *  которую забудут прописать на проде. */
function chatUrl(suffix = ""): string | null {
  if (!CRM_LEAD_URL || !CRM_LEAD_API_KEY) return null;
  return CRM_LEAD_URL.replace(/\/website-lead\/?$/, "/website-chat") + suffix;
}

/** Карточка объекта — то же, что CRM показала бы фотографиями в мессенджере,
 *  здесь заменяет их: телефона у посетителя сайта ещё нет, а вложения виджет
 *  чата не пересылает. */
export interface PropertyCard {
  shortId: number;
  title: string;
  price: string;
  rooms?: number;
  areaSqm?: number;
  district: string;
  address?: string;
  photoUrl: string | null;
  photoUrls?: string[];
  siteUrl: string;
}

export interface CrmChatMessage {
  role: "user" | "assistant";
  content: string;
  at: string | null;
  /** Кто ответил со стороны компании. Виджет подписывает реплики живого сотрудника
   *  иначе, чем ответы бота: человеку важно понимать, с кем он говорит. */
  author: "bot" | "human" | null;
  propertyCard?: PropertyCard;
}

/** Реплики бота на сообщение посетителя. null — интеграция выключена или CRM
 *  недоступна: вызывающий покажет посетителю понятный запасной путь. */
export async function crmChatSend(input: {
  sessionId: string;
  text: string;
  pageUrl?: string;
}): Promise<{ messages: string[]; botOff?: boolean } | null> {
  const url = chatUrl();
  if (!url) return null;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": CRM_LEAD_API_KEY! },
      body: JSON.stringify(input),
      // CRM отвечает мгновенно (23.08.2026: ход ИИ ушёл в фон, ответ виджет забирает
      // опросом, см. commit "fix(чат сайта)…") — это короткий запрос «положить в
      // очередь», а не ожидание модели. Долгий таймаут здесь только маскировал бы
      // реальный сбой сети до самого предела ожидания.
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const body = (await res.json().catch(() => null)) as { messages?: unknown; botOff?: boolean } | null;
    const messages = Array.isArray(body?.messages)
      ? (body!.messages as unknown[]).filter((m): m is string => typeof m === "string" && m.trim().length > 0)
      : [];
    return { messages, botOff: body?.botOff === true };
  } catch {
    // CRM недоступна — виджет покажет запасной путь (WhatsApp / оставить номер).
    // Сообщение при этом теряется: писать его в базу сайта незачем, там нет ни
    // диалога, ни того, кто на него ответит.
    return null;
  }
}

/**
 * Рабочее ли сейчас время у CRM (Настройки → часовой пояс Душанбе) — для кнопки
 * «Перезвоните мне»: в рабочее время она обещает скорый звонок и показывает
 * анимацию соединения, вне часов — честно принимает обычную заявку. Расписание
 * живёт только в CRM: держать его копию на сайте значило бы разводить два места
 * правды при каждой правке часов в Настройках.
 *
 * `null` при недоступности CRM — вызывающий трактует это как «вне рабочего
 * времени» (безопаснее занизить ожидания, чем обещать скорый звонок, которого
 * никто не сделает).
 */
export async function crmWorkingHours(): Promise<boolean | null> {
  const chat = chatUrl();
  if (!chat) return null;
  const url = chat.replace(/\/website-chat$/, "/website-working-hours");
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4_000) });
    if (!res.ok) return null;
    const body = (await res.json().catch(() => null)) as { withinWorkingHours?: unknown } | null;
    return typeof body?.withinWorkingHours === "boolean" ? body.withinWorkingHours : null;
  } catch {
    return null;
  }
}

/** Новые реплики после отметки времени. null — интеграция выключена или CRM молчит;
 *  виджет в этом случае просто не обновляет ленту и повторит попытку позже. */
export async function crmChatPoll(
  sessionId: string,
  after?: string
): Promise<{ messages: CrmChatMessage[]; paused: boolean } | null> {
  const base = chatUrl(`/${encodeURIComponent(sessionId)}`);
  if (!base) return null;
  const url = after ? `${base}?after=${encodeURIComponent(after)}` : base;

  try {
    const res = await fetch(url, {
      headers: { "X-Api-Key": CRM_LEAD_API_KEY! },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const body = (await res.json().catch(() => null)) as {
      messages?: CrmChatMessage[];
      paused?: boolean;
    } | null;
    return { messages: Array.isArray(body?.messages) ? body!.messages : [], paused: body?.paused === true };
  } catch {
    return null;
  }
}
