/**
 * Необязательные нейтральные редакционные иллюстрации для блога.
 * В режиме mixed конкретное жильё иллюстрируется реальными каталоговыми фото
 * с источником, общие практические темы — подписанной предметной иллюстрацией.
 * Промпты запрещают выдуманные квартиры, городские виды и лица.
 * Техническая проверка изображения не заменяет визуальную редакторскую оценку.
 * Ошибка рисования оставляет статью без AI-обложки; paid preview вызывает root отдельно.
 */
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { saveDataUrl } from "./uploads";
import type { PhotoInspection } from "./blog-photo-plan";
import { geminiUrl, geminiProxyHeaders } from "./gemini-transport";

/**
 * Модели-художники СПИСКОМ, а не одним именем: Google снимает версии с раздачи
 * молча (в этом же репозитории на этом уже обожглись — см. GEMINI_MODELS в
 * blog-generator.ts). 404 → берём следующую, любая другая ошибка пробрасывается
 * сразу: с тем же неверным ключом остальные модели ответят тем же.
 *
 * Список сверен с /v1beta/models боевого ключа 15.08.2026, порядок — от дешёвой
 * и быстрой к дорогой.
 */
const IMAGE_MODELS = ["gemini-3.1-flash-image", "gemini-3-pro-image", "gemini-2.5-flash-image"] as const;

/** Рисование дольше текста: 2 минуты против ~1 на статью. */
const IMAGE_TIMEOUT_MS = 2 * 60 * 1000;

/** 429 (лимит в минуту) и 503 (перегрузка) стоит переждать; коды 400/401/404 от паузы не изменятся. */
const RETRY_DELAYS_MS = [3000, 8000];

/** saveDataUrl отказывает файлам больше 8 МБ — крупную картинку ужимаем сами, а не теряем. */
const MAX_RAW_BYTES = 8 * 1024 * 1024;
const SHRINK_WIDTH = 1920;

/**
 * Нейтральная иллюстрация должна соответствовать вопросу читателя и иметь
 * явную подпись. Скрыть искусственное происхождение или подтвердить ею
 * состояние реального дома невозможно.
 */
const STYLE_RULES = [
  "Create a neutral editorial illustration of generic objects relevant to this topic, with natural materials, restrained green and warm neutral colours, plausible lighting and clean composition.",
  "This is clearly an illustration, not a photograph of a real property, street or completed client project.",
  "No invented Dushanbe or Tajikistan skyline, buildings, streets, recognizable architecture, maps, apartment plans or model developments.",
  "No people, hands, faces, body parts or staged transactions.",
  "No text, no letters, no readable labels, logos, numbers, watermark, fake documents, certificates, charts, UI or collages.",
  "Do not stage it as a listing photo of a specific apartment or a completed customer project.",
  "Prefer a specific small still life related to the question: materials and measuring tools, moving boxes, a key and folder, a camera on a table. Vary the objects and composition between articles.",
  "Do not recreate the content of an attached real listing photograph. Use any reference only for light, materials and colour."
].join(" ");

/** Подсказка модели, когда рядом идёт настоящая фотография-образец. */
const REFERENCE_HINT = [
  "The attached reference is a real photograph from our own catalogue.",
  "Use it only to understand natural light, materials and colour temperature.",
  "Do not copy the property, its facade, interior, skyline, composition or location.",
  "Create a neutral still life illustration matching the topic, never an imagined actual Dushanbe property or project."
].join(" ");

export interface CoverSubject {
  title: string;
  excerpt?: string | null;
  /** Описание сцены от модели, которая писала статью (необязательное поле ответа). */
  imagePrompt?: string | null;
  /**
   * Текст статьи. Если сцену никто не описал, модель читает статью и придумывает
   * кадр сама — описывать картинку руками человек не должен.
   */
  contentHtml?: string | null;
  /** Сцены соседних статей: их модель должна обойти, иначе весь блог — один кадр. */
  avoidScenes?: string[] | null;
  /**
   * Настоящая фотография из каталога как образец съёмки (путь вида
   * `/api/uploads/…`). Модель видит, как выглядит реальный кадр в Душанбе, и
   * рисует ближе к жизни — без глянца и придуманных фасадов.
   */
  referencePhoto?: string | null;
}

/** Промт художнику: сцена от автора статьи, если он её описал, иначе — по заголовку. */
export function buildCoverPrompt(subject: CoverSubject): string {
  const candidate = subject.imagePrompt?.trim();
  const scene = candidate && !/skyline|city|street|facade|building|architecture|residential|district|people|person|faces?|hands?|queue|город|панорам|фасад|здани|жил.{0,15}комплекс|люд|очеред|рук[аи]/i.test(candidate) ? candidate : undefined;
  const topic = [subject.title, subject.excerpt?.trim()].filter(Boolean).join(". ");
  return scene
    ? `${scene}\n\n${STYLE_RULES}`
    : `Create a header image illustrating the topic of this article: «${topic}».\n\n${STYLE_RULES}`;
}

// ─── Сцену придумывает модель, прочитав статью ───

/**
 * Дешёвые текстовые модели — тем же списком и по той же причине, что и художники:
 * Google снимает версии с раздачи молча. Читать статью и придумать кадр — работа
 * на копейки, самой простой модели хватает.
 */
const SCENE_MODELS = ["gemini-flash-latest", "gemini-2.5-flash", "gemini-3.6-flash"] as const;

/** Сколько текста статьи показываем: начала хватает, чтобы понять тему и тон. */
const SCENE_INPUT_CHARS = 6000;

const SCENE_INSTRUCTION = [
  "Подбери предметную сцену для нейтральной редакционной иллюстрации к статье ROYAL HOME.",
  "Прочитай статью и опиши одну конкретную композицию с обычными предметами, относящимися к вопросу читателя.",
  "Ответ только на английском, одно-два предложения без пояснений. Это подписанная иллюстрация, не реальная квартира или выполненный проект.",
  "Примеры: материалы и измерительные инструменты для ремонта; коробки для переезда; ключ и закрытая папка для подготовки документов; камера на столе для объявления.",
  "Для документов допускается закрытая папка или пустая бумага без текста, печатей, реквизитов и официальных форм. Не рисуй юридические доказательства.",
  "Меняй набор предметов, композицию и мягкий естественный свет. Избегай одинаковой сцены у соседних статей.",
  "Запрещены люди, лица, руки, очередь, сделки, городские панорамы, реальные или выдуманные улицы и здания Душанбе/Таджикистана, архитектурные макеты, карты и планы квартир.",
  "Запрещены текст, цифры, вывески, логотипы, официальные сертификаты, графики и интерфейсы. Не пытайся воссоздать реальный объект из каталога."
].join(" ");

/** Кадры соседних статей, чтобы блог не выглядел одной фотографией шесть раз. */
function avoidBlock(avoidScenes?: string[] | null): string {
  const list = (avoidScenes ?? []).filter(Boolean).slice(-8);
  if (!list.length) return "";
  return (
    "\n\nЭти кадры уже заняты обложками соседних статей — придумай заметно другой " +
    "(другой тип сцены, не только другой ракурс):\n" +
    list.map((s) => `- ${s}`).join("\n")
  );
}

/** Текст статьи без разметки — модели нужен смысл, а не теги. */
export function articleToPlainText(contentHtml: string): string {
  return contentHtml
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Просит модель прочитать статью и описать кадр.
 * @returns описание сцены или null — тогда обложка рисуется по заголовку.
 */
export async function describeArticleScene(apiKey: string, subject: CoverSubject): Promise<string | null> {
  const body = subject.contentHtml ? articleToPlainText(subject.contentHtml).slice(0, SCENE_INPUT_CHARS) : "";
  const article =
    [
      `Заголовок: ${subject.title}`,
      subject.excerpt?.trim() ? `Краткое описание: ${subject.excerpt.trim()}` : "",
      body ? `Текст статьи: ${body}` : "",
    ]
      .filter(Boolean)
      .join("\n\n") + avoidBlock(subject.avoidScenes);

  for (const model of SCENE_MODELS) {
    try {
      const res = await fetch(geminiUrl(`/v1beta/models/${model}:generateContent`), {
        method: "POST",
        signal: AbortSignal.timeout(60_000),
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": apiKey,
          ...geminiProxyHeaders(),
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SCENE_INSTRUCTION }] },
          contents: [{ role: "user", parts: [{ text: article }] }],
          generationConfig: { maxOutputTokens: 2000 },
        }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        if (res.status === 404 || /NOT_FOUND|no longer available/i.test(text)) continue;
        throw new Error(`Gemini (сцена) вернул ${res.status}: ${text.slice(0, 200)}`);
      }

      const data = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      // Текст может приехать не первой частью (модели с размышлением кладут их рядом).
      const scene = (data.candidates?.[0]?.content?.parts ?? [])
        .map((p) => p.text ?? "")
        .join(" ")
        .trim();
      if (scene) return scene.slice(0, 1000);
    } catch (e) {
      // Отказ ОДНОЙ модели — повод взять следующую, а не рисовать по заголовку:
      // на живом прогоне 15.08 первая модель отвалилась по таймауту, и статья
      // осталась без придуманного кадра, хотя рядом были две рабочие модели.
      console.error(`[blog-cover] Сцену придумать не удалось (${model}):`, e instanceof Error ? e.message : e);
    }
  }
  // Ни одна не ответила — рисуем по заголовку. Сцена улучшение, а не условие.
  return null;
}

/**
 * Читает фотографию каталога с диска и готовит её для модели.
 * Отдаём уменьшенную копию: образцу нужен стиль, а не разрешение, и лишние
 * мегабайты в запросе только замедляют рисование.
 * Файла нет (внешний адрес, удалённая картинка) — работаем без образца.
 */
async function loadReferencePhoto(url: string | null | undefined): Promise<{ mimeType: string; data: string } | null> {
  if (!url || !url.startsWith("/api/uploads/")) return null;
  const name = url.replace("/api/uploads/", "");
  if (name.includes("..") || name.includes("/")) return null;
  const file = path.resolve(process.cwd(), "uploads", name);
  try {
    if (!fs.existsSync(file)) return null;
    const buffer = await sharp(fs.readFileSync(file)).resize({ width: 768, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
    return { mimeType: "image/webp", data: buffer.toString("base64") };
  } catch (e) {
    console.error("[blog-cover] Образец не прочитан:", e instanceof Error ? e.message : e);
    return null;
  }
}

interface GeminiImageResponse {
  candidates?: Array<{
    finishReason?: string;
    content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string }; text?: string }> };
  }>;
  promptFeedback?: { blockReason?: string };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Рисует обложку и сохраняет её в uploads.
 * @returns путь вида `/api/uploads/<uuid>.webp`
 * @throws с понятным текстом — вызывающий решает, показать его или откатиться на фото каталога.
 */
export async function generateCoverImage(apiKey: string, subject: CoverSubject): Promise<string> {
  // Сцену либо описал автор статьи при написании, либо её придумывает модель,
  // прочитав статью. Человек картинку словами не описывает — это и была задача.
  const scene =
    subject.imagePrompt?.trim() || (subject.contentHtml ? await describeArticleScene(apiKey, subject) : null);
  const prompt = buildCoverPrompt({ ...subject, imagePrompt: scene });
  const reference = await loadReferencePhoto(subject.referencePhoto);
  let lastNotFound: string | null = null;

  for (const model of IMAGE_MODELS) {
    try {
      const dataUrl = await drawWithModel(model, apiKey, prompt, reference);
      return await saveDataUrl(dataUrl);
    } catch (err) {
      const text = err instanceof Error ? err.message : String(err);
      if (/\b404\b|NOT_FOUND|no longer available|is not found/i.test(text)) {
        lastNotFound = text;
        continue;
      }
      throw err;
    }
  }

  throw new Error(
    `Ни одна из моделей-художников недоступна этому ключу (${IMAGE_MODELS.join(", ")}). ` +
      `Последний ответ: ${lastNotFound ?? "нет данных"}`
  );
}

/** То же самое, но без исключений: для пайплайна, где обложка — не повод потерять статью. */
export async function tryGenerateCoverImage(apiKey: string, subject: CoverSubject): Promise<string | null> {
  try {
    return await generateCoverImage(apiKey, subject);
  } catch (e) {
    console.error("[blog-cover] Обложку нарисовать не удалось, беру фото каталога:", e);
    return null;
  }
}

async function drawWithModel(
  model: string,
  apiKey: string,
  prompt: string,
  reference: { mimeType: string; data: string } | null
): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(geminiUrl(`/v1beta/models/${model}:generateContent`), {
      method: "POST",
      signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey,
        ...geminiProxyHeaders(),
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: reference
              ? [{ text: `${prompt}

${REFERENCE_HINT}` }, { inlineData: reference }]
              : [{ text: prompt }],
          },
        ],
        generationConfig: {
          responseModalities: ["IMAGE"],
          imageConfig: { aspectRatio: "16:9" },
        },
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      // Бесплатный тариф отвечает на image-модели именно так — подсказываем причину,
      // иначе «429» читается как «слишком часто жмут кнопку» и ждут, что само пройдёт.
      if (res.status === 429 && /limit: 0/.test(body)) {
        throw new Error(
          "Ключ Gemini на бесплатном тарифе — картинки им рисовать нельзя (квота image-моделей 0). " +
            "Нужен ключ с подключённой оплатой в Google AI Studio."
        );
      }
      if ((res.status === 429 || res.status === 503) && attempt < RETRY_DELAYS_MS.length) {
        await sleep(RETRY_DELAYS_MS[attempt]);
        continue;
      }
      throw new Error(`Gemini (картинка) вернул ${res.status}: ${body.slice(0, 300)}`);
    }

    const data = (await res.json()) as GeminiImageResponse;
    if (data.promptFeedback?.blockReason) {
      throw new Error(`Gemini не стал рисовать обложку (${data.promptFeedback.blockReason}).`);
    }

    const candidate = data.candidates?.[0];
    const part = candidate?.content?.parts?.find((p) => p.inlineData?.data);
    if (!part?.inlineData?.data) {
      const reason = candidate?.finishReason ? ` (finishReason: ${candidate.finishReason})` : "";
      throw new Error(`Gemini вернул ответ без картинки${reason}.`);
    }

    return await toStorableDataUrl(part.inlineData.mimeType || "image/png", part.inlineData.data);
  }
}

/**
 * Картинка в виде data URL, который переварит saveDataUrl: тип из белого списка
 * и объём в пределах лимита. Крупные (2K у pro-модели) ужимаем здесь, чтобы не
 * получить отказ «файл слишком большой» на готовой, уже оплаченной картинке.
 */
async function toStorableDataUrl(mimeType: string, base64: string): Promise<string> {
  const buffer = Buffer.from(base64, "base64");
  await inspectCoverBuffer(buffer);
  const known = ["image/jpeg", "image/png", "image/webp"].includes(mimeType);
  if (known && buffer.byteLength <= MAX_RAW_BYTES) {
    return `data:${mimeType};base64,${base64}`;
  }
  const webp = await sharp(buffer)
    .resize({ width: SHRINK_WIDTH, withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();
  return `data:image/webp;base64,${webp.toString("base64")}`;
}

/** Technical checks detect corrupt, tiny or near-empty pictures. They cannot
 * certify realistic architecture or anatomy; real first-party photos remain the default.
 */
export async function inspectCoverBuffer(buffer: Buffer): Promise<PhotoInspection> {
  if (buffer.length > 16 * 1024 * 1024) throw new Error("Изображение превышает 16 МБ");
  const image = sharp(buffer, { limitInputPixels: 32_000_000, failOn: "error" });
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height || metadata.width < 900 || metadata.height < 500) throw new Error("Для обложки нужно фото от 900×500 пикселей");
  const stats = await image.stats();
  if (stats.entropy < 0.8) throw new Error("Обложка почти однотонная или пустая");
  return { width: metadata.width, height: metadata.height, entropy: stats.entropy };
}

export async function inspectCatalogPhoto(url: string): Promise<PhotoInspection | null> {
  try {
    const parsed = new URL(url, "https://royalhome.tj");
    if (parsed.protocol !== "https:" || !["royalhome.tj", "crm.royalhome.tj"].includes(parsed.hostname) || parsed.username || parsed.password) return null;
    let buffer: Buffer;
    if (parsed.pathname.startsWith("/api/uploads/") && !parsed.pathname.slice(13).includes("/")) {
      const file = path.resolve(process.cwd(), "uploads", path.basename(parsed.pathname));
      if (fs.existsSync(file)) buffer = fs.readFileSync(file);
      else buffer = await readPublicPhoto(parsed.href);
    } else buffer = await readPublicPhoto(parsed.href);
    return await inspectCoverBuffer(buffer);
  } catch { return null; }
}
async function readPublicPhoto(url: string): Promise<Buffer> {
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000), redirect: "error" });
  if (!response.ok || !response.headers.get("content-type")?.startsWith("image/")) throw new Error("Фото недоступно");
  if (Number(response.headers.get("content-length")) > 16 * 1024 * 1024) throw new Error("Фото слишком большое");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Пустое фото");
  const chunks: Buffer[] = []; let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    bytes += value.length;
    if (bytes > 16 * 1024 * 1024) { await reader.cancel(); throw new Error("Фото слишком большое"); }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}
