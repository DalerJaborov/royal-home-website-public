/**
 * Свежие факты рынка из интернета — перед тем, как писать статью.
 *
 * ЗАЧЕМ. Модель знает мир на момент своего обучения и не знает, что изменилось в
 * Таджикистане на этой неделе: ставки, госпрограммы, новые правила регистрации,
 * новые сервисы. Без этого статья либо обходит важное молчанием, либо — хуже —
 * пишет по памяти то, что уже неверно.
 *
 * КАК. Отдельный вызов Gemini с включённым поиском Google (tool `google_search`).
 * Отдельный, потому что поиск не сочетается со строгой JSON-схемой: ответ должен
 * быть либо структурированным, либо найденным. Поэтому сначала собираем факты
 * текстом со ссылками, а потом отдаём их автору статьи как материал.
 *
 * ИСТОЧНИКИ ПРОВЕРЯЕМ. Поиск охотно возвращает соцсети и агрегаторы: в первом же
 * прогоне 15.08.2026 тремя источниками оказались vk.com. Такие отбрасываем —
 * ссылка на паблик во «ВКонтакте» не подтверждает ни ставку, ни закон.
 */
import { geminiUrl, geminiProxyHeaders } from "./gemini-transport";
import { isPrimarySourceUrl, excludesAutomaticTopic } from "./blog-editorial-policy";

const NEWS_MODELS = ["gemini-flash-latest", "gemini-2.5-flash", "gemini-3.6-flash"] as const;

/** Соцсети и доски объявлений: как подтверждение факта не годятся. */
const JUNK_SOURCES = [
  "vk.com",
  "vk.ru",
  "facebook.com",
  "instagram.com",
  "ok.ru",
  "t.me",
  "pinterest",
  "youtube.com",
  "tiktok.com",
];

const NEWS_PROMPT = [
  "Найди, что реально изменилось на рынке недвижимости Таджикистана и Душанбе за последние 6 месяцев.",
  "Интересует: публичные данные строительства, разрешения новостроек, официальная инфраструктура и городские сервисы. Не ищи ипотеку, жилищные кредиты и программы банков.",
  "требования к сделкам и регистрации недвижимости, цифровые сервисы для проверки застройщиков и новостроек,",
  "крупные новости строительства в Душанбе.",
  "",
  "Правила ответа:",
  "- Только то, что подтверждается найденными страницами. Ничего не додумывай и не обобщай по памяти.",
  "- Опирайся только на первичные официальные сайты: memor.pro, stat.tj, dushanbe.tj, andoz.tj, adlia.tj, mmih.tj, president.tj.",
  "  Соцсети, форумы и доски объявлений источником не считаются.",
  "- Каждый факт — отдельным пунктом: суть, дата или период, и название источника.",
  "- Если по теме ничего свежего не нашлось, так и напиши: «свежих изменений не найдено». Пустой ответ лучше выдуманного.",
  "- 5-8 пунктов, по-русски, без вступления и заключения.",
].join("\n");

export interface MarketNews {
  /** Найденные факты списком, как их изложила модель. */
  text: string;
  /** Источники, на которые она опиралась (мусорные отброшены). */
  sources: Array<{ title: string; url: string }>;
}

/**
 * Собирает свежие факты рынка.
 * @returns null, если поиск недоступен или ничего пригодного не нашлось —
 *          статья тогда пишется строго на данных каталога, как раньше.
 */
export async function collectMarketNews(apiKey: string): Promise<MarketNews | null> {
  for (const model of NEWS_MODELS) {
    try {
      const res = await fetch(geminiUrl(`/v1beta/models/${model}:generateContent`), {
        method: "POST",
        signal: AbortSignal.timeout(120_000),
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": apiKey,
          ...geminiProxyHeaders(),
        },
        body: JSON.stringify({
          tools: [{ google_search: {} }],
          contents: [{ role: "user", parts: [{ text: NEWS_PROMPT }] }],
          generationConfig: { maxOutputTokens: 8000 },
        }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        if (res.status === 404 || /NOT_FOUND|no longer available/i.test(body)) continue;
        throw new Error(`Gemini (новости) вернул ${res.status}: ${body.slice(0, 200)}`);
      }

      const data = (await res.json()) as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> };
          groundingMetadata?: { groundingChunks?: Array<{ web?: { title?: string; uri?: string } }> };
        }>;
      };
      const candidate = data.candidates?.[0];
      const text = (candidate?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
      // «Не найдено» отбрасываем, только когда это ВЕСЬ ответ. Первая версия
      // проверяла вхождение фразы где угодно — и выбрасывала 2637 символов
      // найденных фактов из-за одного пункта «по этой теме изменений не найдено».
      if (!text) return null;
      if (text.length < 300 && /не найдено|ничего не наш/i.test(text)) return null;

      const sources = (candidate?.groundingMetadata?.groundingChunks ?? [])
        .map((c) => ({ title: c.web?.title?.trim() ?? "", url: c.web?.uri?.trim() ?? "" }))
        .filter((s) => s.url && isPrimarySourceUrl(s.url) && !excludesAutomaticTopic(s.title) && !JUNK_SOURCES.some((junk) => s.url.includes(junk) || s.title.includes(junk)))
        .slice(0, 8);

      if (!sources.length) return null;
      const safeText = text.split(/\n/).filter((line) => !excludesAutomaticTopic(line)).join("\n");
      return safeText.trim() ? { text: safeText.slice(0, 4000), sources } : null;
    } catch (e) {
      console.error(`[market-news] Свежие факты собрать не удалось (${model}):`, e instanceof Error ? e.message : e);
    }
  }
  return null;
}
