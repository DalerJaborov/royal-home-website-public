/**
 * Ежеквартальное обновление вышедших статей: свежие цифры вместо прошлогодних.
 *
 * ЗАЧЕМ. Статья «сколько стоит квадратный метр» через полгода врёт: база сайта
 * изменилась, а текст — нет. Поисковики ранжируют свежее выше, а читатель,
 * увидев цену прошлого сезона, перестаёт верить и остальному.
 *
 * ПОЧЕМУ НЕ ПЕРЕПИСЫВАЕМ СТАТЬЮ ЗАНОВО. У статьи есть накопленные позиции в
 * поиске и ссылки на неё; новый текст под тем же адресом — это потеря того, что
 * уже заработано, ради того же самого содержания. Поэтому просим модель поменять
 * ТОЛЬКО числа и явные ссылки на период, а результат проверяем: не изменились ни
 * длина, ни разметка, ни заголовки — иначе правку отклоняем целиком.
 */
import { geminiUrl, geminiProxyHeaders } from "./gemini-transport";
import { findFirstPersonHits } from "./agency-voice";
import { excludesAutomaticTopic } from "./blog-editorial-policy";

const REFRESH_MODELS = ["gemini-flash-latest", "gemini-2.5-flash", "gemini-3.6-flash"] as const;

/** Статью считаем устаревшей через квартал: цены за это время заметно уезжают. */
export const REFRESH_AFTER_DAYS = 90;

const INSTRUCTION = [
  "Ты редактор блога агентства недвижимости Royal Home в Душанбе.",
  "Тебе дают текст вышедшей статьи и СВЕЖИЕ данные рынка.",
  "Обнови в тексте ТОЛЬКО то, что устарело: числа, цены, количество объектов, месяц и год.",
  "Всё остальное оставь дословно: структуру, заголовки, порядок абзацев, разметку и теги, ссылки, картинки, длину текста.",
  "Новые разделы не добавляй, старые не удаляй. Не меняй тему и выводы, если новые данные их не опровергают.",
  "Числа бери только из свежих данных. Чего в данных нет — оставь как было.",
  "Пиши от имени агентства («мы», «у нас»), никакого «я».",
  "Ответь только HTML статьи, без пояснений и без markdown-обёрток.",
].join(" ");

export interface RefreshResult {
  html: string;
  model: string;
}

/**
 * Обновляет цифры в статье.
 * @returns новый HTML или null, если ни одна модель не справилась или правка
 *          не прошла проверку (тогда статья остаётся как была).
 */
export async function refreshArticleNumbers(
  apiKey: string,
  article: { title: string; contentHtml: string },
  marketFacts: string
): Promise<RefreshResult | null> {
  if (excludesAutomaticTopic(`${article.title} ${article.contentHtml}`)) return null;
  const input = `Свежие данные рынка:\n${marketFacts}\n\nСтатья «${article.title}»:\n${article.contentHtml}`;

  for (const model of REFRESH_MODELS) {
    try {
      const res = await fetch(geminiUrl(`/v1beta/models/${model}:generateContent`), {
        method: "POST",
        signal: AbortSignal.timeout(180_000),
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": apiKey,
          ...geminiProxyHeaders(),
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: INSTRUCTION }] },
          contents: [{ role: "user", parts: [{ text: input }] }],
          generationConfig: { maxOutputTokens: 32000 },
        }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        if (res.status === 404 || /NOT_FOUND|no longer available/i.test(body)) continue;
        throw new Error(`Gemini (обновление) вернул ${res.status}: ${body.slice(0, 200)}`);
      }

      const data = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const raw = (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
      const cleaned = stripCodeFence(raw);
      const problem = checkRefresh(article.contentHtml, cleaned);
      if (problem || excludesAutomaticTopic(cleaned)) {
        console.error(`[article-refresh] Правка отклонена (${model}): ${problem}`);
        continue;
      }
      return { html: cleaned, model };
    } catch (e) {
      console.error(`[article-refresh] Обновить не удалось (${model}):`, e instanceof Error ? e.message : e);
    }
  }
  return null;
}

function stripCodeFence(text: string): string {
  const fenced = /^```[a-z]*\n([\s\S]*)\n```$/i.exec(text.trim());
  return (fenced ? fenced[1] : text).trim();
}

/**
 * Проверка результата. Правка обязана быть точечной: модель, переписавшая статью
 * заново, дороже устаревших цифр — теряются накопленные позиции в поиске.
 */
export function checkRefresh(before: string, after: string): string | null {
  if (!after) return "пустой ответ";

  const ratio = after.length / before.length;
  if (ratio < 0.85 || ratio > 1.15) return `длина изменилась в ${ratio.toFixed(2)} раза`;

  const tags = (s: string) => (s.match(/<[a-z][^>]*>/gi) ?? []).length;
  if (tags(before) !== tags(after)) return `разметка изменилась: было тегов ${tags(before)}, стало ${tags(after)}`;

  const headings = (s: string) => (s.match(/<h2\b/gi) ?? []).length;
  if (headings(before) !== headings(after)) return "изменилось число разделов";

  const images = (s: string) => (s.match(/<img\b/gi) ?? []).length;
  if (images(before) !== images(after)) return "картинки пропали или добавились";
  const openingTags = (text: string) => JSON.stringify(text.match(/<[a-z][^>]*>/gi) ?? []);
  if (openingTags(before) !== openingTags(after)) return "изменились ссылки, изображения или атрибуты разметки";
  const invariant = (text: string) => text.replace(/\d[\d\s\u00a0\u202f.,]*/g, "#")
    .replace(/январ[ья]|феврал[ья]|март[а]?|апрел[ья]|ма[йя]|июн[ья]|июл[ья]|август[а]?|сентябр[ья]|октябр[ья]|ноябр[ья]|декабр[ья]/gi, "MONTH")
    .replace(/\s+/g, " ");
  if (invariant(before) !== invariant(after)) return "правка изменила смысл или текст вне чисел и периода";

  const first = findFirstPersonHits(after);
  if (first.length) return `появилось первое лицо: ${first.slice(0, 3).join(", ")}`;

  if (after === before) return "текст не изменился";

  return null;
}
