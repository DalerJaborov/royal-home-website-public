import { z } from "zod";
import { createRouter, adminQuery } from "./middleware";
import { buildListingSeoMeta } from "./lib/seo";
import { geminiUrl, geminiProxyHeaders } from "./lib/gemini-transport";
import { getGeminiApiKey } from "./blog-generator";

const inputSchema = z.object({
  title: z.string(),
  location: z.string(),
  price: z.number(),
  rooms: z.number(),
  area: z.number(),
  floor: z.string().optional(),
  type: z.enum(["Новостройки", "Вторичка"]).nullable(),
  repair: z.string().optional(),
  district: z.string().optional(),
  details: z.record(z.string(), z.string()).optional(),
});

type GenInput = z.infer<typeof inputSchema>;

/** Всё, что отдаём в форму: продающее описание + полный набор SEO-полей. */
interface GenResult {
  description: string;
  seoDescription: string;
  metaTitle: string;
  metaDescription: string;
  h1: string;
}

const DETAIL_LABELS: Record<string, string> = {
  balcony: "балкон",
  bathroom: "санузел",
  ceilingHeight: "потолки",
  windows: "окна",
  heating: "отопление",
  elevator: "лифт",
  parking: "парковка",
  security: "безопасность",
  yearBuilt: "год постройки",
  material: "материал дома",
  internet: "интернет",
  furniture: "мебель",
  appliances: "техника",
};

// Deterministic template — always available, no API key needed. Varies phrasing
// by rooms/area so descriptions don't read copy-pasted. SEO-мета берём из
// общего модуля (api/lib/seo.ts), чтобы правила совпадали со страховкой на бэке.
function templateResult(input: GenInput): GenResult {
  const districtPart = input.district ? ` в районе ${input.district}` : "";
  const floorPart = input.floor ? `, ${input.floor} этаж` : "";
  const typeWord = input.type === "Новостройки" ? "новостройке" : "жилом доме";
  const repairPart =
    input.repair && input.repair !== "Без ремонта" ? ` Выполнен ${input.repair.toLowerCase()}.` : "";

  const roomWord = input.rooms === 1 ? "квартира-студия" : `${input.rooms}-комнатная квартира`;

  const openers = [
    `Продаётся ${roomWord} площадью ${input.area} м²${districtPart} Душанбе${floorPart}.`,
    `В продаже — ${roomWord} ${input.area} м²${districtPart} Душанбе${floorPart}.`,
    `Отличное предложение: ${roomWord} ${input.area} м²${districtPart} Душанбе${floorPart}.`,
  ];
  const opener = openers[(input.rooms + input.area) % openers.length];

  const detailLines: string[] = [];
  if (input.details) {
    for (const [key, value] of Object.entries(input.details)) {
      const label = DETAIL_LABELS[key];
      if (label && value && key !== "district") detailLines.push(`${label} — ${value.toLowerCase()}`);
    }
  }
  const detailsPart = detailLines.length ? ` Особенности: ${detailLines.slice(0, 6).join(", ")}.` : "";

  const middles = [
    `Квартира расположена в ${typeWord}, продуманная планировка без потерь площади.${repairPart}`,
    `Дом — ${
      input.type === "Новостройки" ? "современная новостройка" : "проверенный жилой фонд"
    }, удобное расположение и развитая инфраструктура рядом.${repairPart}`,
  ];
  const middle = input.type ? middles[input.area % middles.length] : `Состояние объекта и условия просмотра уточните у агента.${repairPart}`;

  const closer = `Агентство ROYAL HOME сопровождает сделку на всех этапах: проверка документов, договор, безопасный расчёт. Звоните — организуем показ в удобное время.`;

  const description = `${opener} ${middle}${detailsPart}\n\n${closer}`;

  const seo = buildListingSeoMeta({ ...input, type: input.type ?? undefined });
  return {
    description,
    seoDescription: seo.metaDescription,
    metaTitle: seo.metaTitle,
    metaDescription: seo.metaDescription,
    h1: seo.h1,
  };
}

/**
 * Экспертный SEO-промпт: модель выступает в роли ведущего SEO-копирайтера по
 * недвижимости Душанбе и отдаёт сразу весь набор полей строгим JSON. Любое
 * пропущенное/некорректное поле добираем из детерминированного шаблона, поэтому
 * результат всегда полный.
 *
 * 15.08.2026 переведено с Claude на Gemini: владелец отказался от Claude на сайте.
 * Ходим через тот же прокси, что и остальной Gemini (см. lib/gemini-transport) —
 * напрямую из нашего региона Google отвечает 400 «User location is not supported».
 */
async function geminiResult(input: GenInput, apiKey: string): Promise<GenResult | null> {
  const detailsText = input.details
    ? Object.entries(input.details)
        .map(([k, v]) => `${DETAIL_LABELS[k] ?? k}: ${v}`)
        .join(", ")
    : "";

  const prompt = `Ты — ведущий SEO-специалист и копирайтер по недвижимости в Душанбе (Таджикистан) для агентства ROYAL HOME. Твоя задача — дать МАКСИМАЛЬНО эффективный SEO для карточки квартиры: тексты должны продавать людям и одновременно ранжироваться в Google/Яндекс по запросам вида «купить квартиру в Душанбе», по району и комнатности.

Данные квартиры:
- Название: ${input.title}
- Адрес: ${input.location}
- Цена: ${input.price.toLocaleString("ru-RU")} сомони
- Комнат: ${input.rooms}, площадь: ${input.area} м²${input.floor ? `, этаж ${input.floor}` : ""}
- Тип: ${input.type ?? 'не указан; не определять по догадке'}${input.repair ? `, ремонт: ${input.repair}` : ""}${input.district ? `\n- Район: ${input.district}` : ""}${detailsText ? `\n- Детали: ${detailsText}` : ""}

Сгенерируй строго на русском языке:
1. "metaTitle" — заголовок для <title> и Google, ДО 60 символов, главный ключевой запрос («купить … квартиру … в Душанбе» + район) в начале. Без названия агентства.
2. "h1" — заголовок H1 на странице объекта, живой и человечный, с комнатностью, площадью и районом.
3. "metaDescription" — мета-описание для поиска, ДО 160 символов, с ключевыми словами, ценой и призывом к действию.
4. "seoDescription" — короткое SEO-описание (1-2 предложения, до 160 символов), можно совпадать по смыслу с metaDescription, но другой формулировкой.
5. "description" — продающее описание для страницы (2-3 абзаца, без заголовков и markdown): выгоды, район, инфраструктура, состояние, и мягкий призыв обратиться в ROYAL HOME.

Пиши от имени агентства («мы», «у нас»), а не от лица человека. Соблюдай лимиты символов.`;

  // Модели списком: Google снимает версии с раздачи молча, и один прибитый
  // гвоздём идентификатор уже ронял здесь генерацию (см. GEMINI_MODELS в blog-generator).
  for (const model of ["gemini-flash-latest", "gemini-2.5-flash", "gemini-3.6-flash"]) {
    try {
      const res = await fetch(geminiUrl(`/v1beta/models/${model}:generateContent`), {
        method: "POST",
        // Таймаут обязателен: без него зависший ответ держал запрос админки до
        // упора, и человек смотрел на крутящуюся кнопку «Сгенерировать» без
        // возможности понять, что происходит. При отказе ниже отрабатывает
        // шаблон, поэтому сорванный вызов не оставляет карточку без текста.
        signal: AbortSignal.timeout(45_000),
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": apiKey,
          ...geminiProxyHeaders(),
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: {
                metaTitle: { type: "STRING" },
                h1: { type: "STRING" },
                metaDescription: { type: "STRING" },
                seoDescription: { type: "STRING" },
                description: { type: "STRING" },
              },
              required: ["metaTitle", "h1", "metaDescription", "seoDescription", "description"],
            },
            maxOutputTokens: 4000,
          },
        }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        if (res.status === 404 || /NOT_FOUND|no longer available/i.test(body)) continue;
        console.error(`[ai-router] Gemini вернул ${res.status}: ${body.slice(0, 200)}`);
        return null;
      }

      const data = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const text = (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
      if (!text) continue;

      const parsed = JSON.parse(text) as Partial<GenResult>;
      if (!parsed.description) return null;

      // Любое недостающее поле добираем из шаблона — форма всегда получает полный набор.
      const fallback = templateResult(input);
      return {
        description: parsed.description,
        seoDescription: parsed.seoDescription?.trim() || fallback.seoDescription,
        metaTitle: parsed.metaTitle?.trim() || fallback.metaTitle,
        metaDescription: parsed.metaDescription?.trim() || fallback.metaDescription,
        h1: parsed.h1?.trim() || fallback.h1,
      };
    } catch (e) {
      console.error(`[ai-router] Описание не сгенерировано (${model}):`, e instanceof Error ? e.message : e);
      return null;
    }
  }
  return null;
}

export const aiRouter = createRouter({
  generateDescription: adminQuery.input(inputSchema).mutation(async ({ input }) => {
    // Ключ — тот же, что у блога: сначала настройка админки, потом env.
    const apiKey = await getGeminiApiKey();
    if (apiKey) {
      const result = await geminiResult(input, apiKey);
      if (result) return result;
      // Модель не ответила — падаем на шаблон, чтобы кнопка всегда работала.
    }
    return templateResult(input);
  }),
});
