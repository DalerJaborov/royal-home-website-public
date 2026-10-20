/**
 * ИИ-генератор статей блога для SEO.
 *
 *   1. Редакционный план выбирает вопрос с учётом последних100заголовков.
 *   2. Для ценового вопроса передаём фактическую выборку объявлений; для
 *      практической темы не навязываем статистику и плитки цен.
 *   3. Gemini возвращает структурированный черновик. Проверки языка и классов
 *      неподтверждённых утверждений проходят до сохранения/публикации.
 *   4. Ошибка проверки отменяет запись; успешный текст следует blogAutoPublish.
 *      Проверки не заменяют человеческую проверку фактов. Preview не пишет БД.
 *
 * Планировщик: раз в час проверяем «включена ли автогенерация и прошло ли ≥7 дней
 * с последней ИИ-статьи» — такой setInterval переживает рестарты сервера без
 * внешних зависимостей (не нужен node-cron, его нет в package.json).
 */
import { and, desc, gte, sql } from "drizzle-orm";
import { getDb, isDbAvailable } from "./queries/connection";
import { pageViews } from "@db/schema";
import { findAllListings } from "./queries/listings";
import { getCmsEntry, setCmsEntry } from "./queries/cms";
import { sanitizeArticleHtml } from "./lib/sanitize-html";
import { geminiUrl, geminiProxyHeaders } from "./lib/gemini-transport";
import { tryGenerateCoverImage, inspectCatalogPhoto } from "./lib/blog-cover";
import { articleQualityProblems, allowsMarketStatistics, excludesAutomaticTopic, selectEditorialBrief, VERIFIED_RESOURCE_LINKS } from "./lib/blog-editorial-policy";
import type { EditorialBrief } from "./lib/blog-editorial-policy";
import { planArticlePhoto, photoProvenanceHtml, coverStrategy, neutralEditorialScene } from "./lib/blog-photo-plan";
import type { ArticlePhotoPlan, CatalogPhotoListing } from "./lib/blog-photo-plan";
import { COMPANY_CONTACTS, normalizeCompanyContactText } from "@contracts/company-contacts";
import { getLiveReels } from "./instagram-router";
import { chooseRelevantOwnedReel, ownedReelHtml } from "./lib/blog-owned-media";
import { findFirstPersonHits, rewriteToAgencyVoice } from "./lib/agency-voice";
import { findAiCliches, rewriteWithoutCliches } from "./lib/ai-cliches";
import { refreshArticleNumbers, REFRESH_AFTER_DAYS } from "./lib/article-refresh";
import { processMissingArticleTranslations } from './lib/article-translation-generator';
import { collectMarketNews } from "./lib/market-news";
import type { MarketNews } from "./lib/market-news";
import {
  buildFigureHtml,
  buildKeyFactsHtml,
  buildPullQuoteHtml,
  buildTakeawaysHtml,
  insertAfterSection,
  insertPullQuote,
  keepOnlyAllowedLinks,
  insertListingCards,
  buildTableOfContents,
} from "./lib/article-layout";
import type { ListingCard } from "./lib/article-layout";
import {
  createArticle,
  findAllArticles,
  findArticleById,
  findLatestAiArticleDate,
  findRecentArticleTitles,
  findRecentCoverImageUrls,
  slugExists,
  updateArticle,
} from "./queries/articles";
import type { Article } from "@db/schema";

// ─── Настройки (cms key-value, см. blog-router.ts) ───

/**
 * Тумблеры генератора. У автопубликации значение по умолчанию — ВКЛЮЧЕНО
 * (решение владельца 15.08.2026): статья, лежащая в черновиках, не приносит ни
 * посетителей из поиска, ни пользы, а сам факт «черновик/опубликована» владельцу
 * в списке не нужен — статьи должны появляться на сайте сами.
 */
const SETTING_DEFAULTS: Record<string, boolean> = {
  blogAutogenEnabled: false,
  blogAutoPublish: true,
};

export async function getBlogSetting(key: "blogAutogenEnabled" | "blogAutoPublish"): Promise<boolean> {
  const raw = await getCmsEntry(key);
  if (raw === undefined || raw === null || raw === "") return SETTING_DEFAULTS[key] ?? false;
  return raw === "true" || raw === true;
}

/** Ключ Gemini API: сначала из настроек админки (БД), потом из env. */
export async function getGeminiApiKey(): Promise<string | null> {
  const fromDb = await getCmsEntry("geminiApiKey");
  if (typeof fromDb === "string" && fromDb.trim()) return fromDb.trim();
  return process.env.GEMINI_API_KEY?.trim() || null;
}

/**
 * Приоритетные темы/запросы из админки (реальные запросы из Search Console /
 * Яндекс.Метрики): одна строка = один запрос. Пустые строки отбрасываем.
 */
export async function getBlogPriorityTopics(): Promise<string[]> {
  const raw = await getCmsEntry("blogPriorityTopics");
  if (typeof raw !== "string") return [];
  return raw
    .split("\n")
    .map((s) => s.trim())
    .filter((topic) => topic && !excludesAutomaticTopic(topic))
    .slice(0, 100);
}

/**
 * Рубрики блога — те же, что у статей, написанных руками (CATEGORIES в
 * AdminBlogPage и фильтр на /blog). Модель выбирает одну из них: раньше все
 * статьи генератора были «Аналитика», и по любой другой рубрике они пропадали.
 */
export const BLOG_CATEGORIES = [
  "Аналитика",
  "Покупка",
  "Продажа",
  "Инвестиции",
  "Юридические вопросы",
  "Ремонт",
  "Районы",
] as const;

export type BlogCoverMode = "generated" | "photo" | "mixed";

/**
 * «mixed» по умолчанию: для конкретного жилья — реальное фото с источником,
 * для общей практической темы — подписанная нейтральная иллюстрация.
 * Явные режимы «photo» и «generated» сохраняют совместимость с настройками.
 */
export async function getBlogCoverMode(): Promise<BlogCoverMode> {
  const raw = await getCmsEntry("blogCoverMode");
  return raw === "generated" || raw === "photo" ? raw : "mixed";
}

// ─── Сбор данных рынка ───

const KNOWN_DISTRICTS = ["Сино", "Фирдавси", "Шохмансур", "Исмоили Сомони", "Сомони"];

function districtOf(l: { location: string; details?: Record<string, string> | null }): string {
  const explicit = l.details?.district?.trim();
  if (explicit) return explicit;
  const loc = l.location.toLowerCase();
  for (const d of KNOWN_DISTRICTS) {
    if (loc.includes(d.toLowerCase())) return d === "Сомони" ? "Исмоили Сомони" : d;
  }
  return "Другой район";
}

interface MarketData {
  totalActive: number;
  apartmentCount: number;
  coverListings: CatalogPhotoListing[];
  byDistrict: Array<{
    district: string;
    count: number;
    avgPrice: number;
    minPrice: number;
    maxPrice: number;
    avgPricePerM2: number;
  }>;
  byRooms: Array<{ rooms: number; count: number; avgPrice: number; minPrice: number; maxPrice: number }>;
  topViewed: Array<ListingCard & { views: number }>;
  topViewedDistricts: Array<{ district: string; views: number }>;
  /** Кандидаты в обложку статьи: реальные фото каталога, от самых просматриваемых объектов. */
  coverCandidates: string[];
  /**
   * Фото НОВОСТРОЕК — образец съёмки для художника. Именно новостройки, а не
   * любое фото каталога: на снимке старого дома модель считывает эпоху и рисует
   * город тридцатилетней давности (замечание владельца 15.08.2026).
   */
  modernPhotos: string[];
}

async function collectMarketData(): Promise<MarketData> {
  // Полный каталог активных (не проданных) опубликованных объектов.
  const listings = await findAllListings({ sold: false });

  const districtMap = new Map<string, { prices: number[]; ppm2: number[] }>();
  const roomsMap = new Map<number, number[]>();
  for (const l of listings) {
    // Room counts and square-metre prices for apartments must not mix in land,
    // houses and commercial premises synced from the CRM.
    if (l.category !== "APARTMENT") continue;
    const d = districtOf(l);
    if (!districtMap.has(d)) districtMap.set(d, { prices: [], ppm2: [] });
    districtMap.get(d)!.prices.push(l.price);
    if (l.area > 0) districtMap.get(d)!.ppm2.push(l.price / l.area);
    if (!roomsMap.has(l.rooms)) roomsMap.set(l.rooms, []);
    roomsMap.get(l.rooms)!.push(l.price);
  }

  const avg = (arr: number[]) => (arr.length ? Math.round(arr.reduce((s, x) => s + x, 0) / arr.length) : 0);

  const byDistrict = [...districtMap.entries()]
    .map(([district, { prices, ppm2 }]) => ({
      district,
      count: prices.length,
      avgPrice: avg(prices),
      minPrice: Math.min(...prices),
      maxPrice: Math.max(...prices),
      avgPricePerM2: avg(ppm2),
    }))
    .sort((a, b) => b.count - a.count);

  const byRooms = [...roomsMap.entries()]
    .map(([rooms, prices]) => ({
      rooms,
      count: prices.length,
      avgPrice: avg(prices),
      minPrice: Math.min(...prices),
      maxPrice: Math.max(...prices),
    }))
    .sort((a, b) => a.rooms - b.rooms);

  // Самые просматриваемые объекты за 30 дней (page_views → /listing/:id).
  const topViewed: MarketData["topViewed"] = [];
  let topViewedDistricts: MarketData["topViewedDistricts"] = [];
  const coverCandidates: string[] = [];
  if (isDbAvailable()) {
    try {
      const db = getDb()!;
      const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const listingId = sql<number>`cast(substring(regexp_substr(${pageViews.path}, '/listing/[0-9]+'), 10) as unsigned)`;
      const rows = await db
        .select({ id: listingId, count: sql<number>`count(*)` })
        .from(pageViews)
        .where(and(gte(pageViews.createdAt, monthAgo), sql`${pageViews.path} regexp '/listing/[0-9]+'`))
        .groupBy(listingId)
        .orderBy(desc(sql`count(*)`))
        .limit(10);

      const byId = new Map(listings.map((l) => [l.id, l]));
      const districtViews = new Map<string, number>();
      for (const r of rows) {
        const l = byId.get(Number(r.id));
        if (!l) continue;
        if (topViewed.length < 5) {
          topViewed.push({
            id: l.id,
            title: l.title,
            location: l.location,
            price: l.price,
            rooms: l.rooms,
            area: l.area,
            photo: l.imageUrls?.[0] ?? null,
            views: Number(r.count),
          });
        }
        const d = districtOf(l);
        districtViews.set(d, (districtViews.get(d) ?? 0) + Number(r.count));
        // Первое фото объекта — кандидат в обложку статьи (порядок = по просмотрам).
        const photo = l.imageUrls?.[0];
        if (photo && !coverCandidates.includes(photo)) coverCandidates.push(photo);
      }
      topViewedDistricts = [...districtViews.entries()]
        .map(([district, views]) => ({ district, views }))
        .sort((a, b) => b.views - a.views);
    } catch (e) {
      // Аналитика — необязательное сырьё: без неё статья всё равно сгенерируется.
      console.error("[blog-generator] Не удалось собрать статистику просмотров:", e);
    }
  }

  // Фолбэк без аналитики просмотров: любые реальные фото каталога.
  if (!coverCandidates.length) {
    for (const l of listings) {
      const photo = l.imageUrls?.[0];
      if (photo && !coverCandidates.includes(photo)) coverCandidates.push(photo);
      if (coverCandidates.length >= 5) break;
    }
  }

  // Образцы съёмки — только новостройки: сегодняшний Душанбе, а не наследие панелек.
  const modernPhotos = listings
    .filter((l) => l.type === "Новостройки" && l.imageUrls?.length)
    .map((l) => l.imageUrls![0])
    .slice(0, 5);

  return { totalActive: listings.length, apartmentCount: listings.filter((listing) => listing.category === "APARTMENT").length,
    coverListings: listings, byDistrict, byRooms, topViewed, topViewedDistricts, coverCandidates, modernPhotos };
}

/**
 * Обложка новой ИИ-статьи: самое просматриваемое фото каталога, но не то же,
 * что у двух последних статей (если есть из чего выбрать). Нет фото — null (градиент).
 */

// ─── Слаг: транслитерация + уникальность ───

const TRANSLIT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "zh", з: "z", и: "i",
  й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t",
  у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "",
  э: "e", ю: "yu", я: "ya", ҷ: "j", ҳ: "h", қ: "q", ғ: "g", ӯ: "u", ӣ: "i",
};

export function transliterateSlug(input: string): string {
  const slug = input
    .toLowerCase()
    .split("")
    .map((ch) => TRANSLIT[ch] ?? ch)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
  return slug || "statya";
}

export async function ensureUniqueSlug(base: string): Promise<string> {
  let slug = base;
  let n = 2;
  while (await slugExists(slug)) {
    slug = `${base}-${n}`;
    n++;
    if (n > 50) {
      // Страховка от бесконечного цикла — добавляем метку времени.
      return `${base}-${Date.now().toString(36)}`;
    }
  }
  return slug;
}

// ─── Промт статьи ───

/**
 * Промт собран под ДВА разных читателя сразу.
 *
 * 1. Поисковик (Google, Яндекс): один запрос — одна статья, H2 сформулированы как
 *    вопросы, на которые тут же дан ответ, конкретика вместо общих слов.
 * 2. Ответы ИИ (AI Overviews, Gemini, Perplexity): они цитируют не статью целиком,
 *    а самодостаточный кусок в 130–170 слов, и берут его чаще всего из первой трети
 *    текста. Отсюда требования: прямой ответ в первых двух предложениях каждого
 *    раздела, никаких «как мы уже писали выше», числа и имена прямо в абзаце.
 *
 * Плюс то, что удерживает живого человека: блок «Коротко», плитки с цифрами,
 * выделенная мысль и две картинки внутри текста (см. composeArticleHtml).
 */
const SYSTEM_PROMPT = `Ты — редакция агентства недвижимости ROYAL HOME (royalhome.tj) в Душанбе. Пиши полезный ответ на заданный вопрос покупателя, продавца или жителя города. Не обещай первые места в поиске, трафик или заявки: таких данных в задании нет.

ОТ ЧЬЕГО ИМЕНИ ПИШЕШЬ (важнее всего остального):
- Статья выходит от АГЕНТСТВА, а не от конкретного человека. Только «мы», «у нас», «наши клиенты», «к нам обращаются», «мы видим по своей базе».
- НИКОГДА не пиши «я», «мне», «мой опыт», «я работаю», «ко мне обращаются», «на мой взгляд», «я советую» — ни в одном предложении, включая FAQ и вступление.
- Подпись под статьёй — «Редакция Royal Home». Текст, написанный от «я», ей противоречит и читается как обман.

ЯСНЫЙ РЕДАКЦИОННЫЙ ЯЗЫК:
- ЗАПРЕЩЕНЫ книжные обороты, по которым читатель узнаёт нейросеть: «в современном мире», «в наше время», «важно отметить», «стоит отметить», «следует отметить», «важно понимать», «не стоит забывать», «нельзя не отметить», «играет важную роль», «является неотъемлемой частью», «в заключение», «подводя итог», «в данной статье», «давайте разберёмся», «мир недвижимости», «динамично развивается». Ни одного такого оборота в тексте быть не должно.
- Не объявляй, что собираешься сказать, и не подводи итогов словами «итак», «в итоге», «резюмируя». Просто говори по делу и заканчивай, когда сказал.
- Пиши обычными словами, которыми говорит человек в Душанбе, а не языком учебника. Короткие предложения лучше длинных. Если фразу можно сказать проще — скажи проще.
- Каждый абзац должен нести факт, цифру или совет. Абзац «ни о чём», который можно выбросить без потери смысла, выбрасывай сам.
- Пиши конкретно. Не выдумывай клиентов, сделки, стаж, опыт редакции или личные наблюдения. Условный пример прямо называй условным.

ОДИН ЗАПРОС — ОДНА СТАТЬЯ:
- Выбери ОДИН конкретный вопрос, который человек вбивает в поиск («сколько стоит однокомнатная квартира в Сино», «как проверить документы на квартиру в Таджикистане», «сколько стоит ремонт в новостройке»). Вся статья отвечает на него.
- Заголовок H1 (поле title) строго задан редакционным планом. Не добавляй год, район, сумму или комнатность ради поисковых слов.
- Каждый H2 — самостоятельный вопрос или утверждение, которое можно прочитать отдельно от статьи и понять ответ.

О ЧЁМ ПИСАТЬ (репертуар агентства, а не только наш каталог):
Хорошее агентство пишет обо всём, что нужно человеку вокруг сделки. Цены — лишь одна из тем, и статьи только про них быстро надоедают читателю и перестают приводить новых людей из поиска. Выбирай тему из всего списка, а не из первой строки:
- Покупка: как проверить квартиру и продавца, торг, задаток и аванс, приёмка новостройки, ошибки покупателей.
- Юридические вопросы: какие документы нужны, регистрация сделки в Таджикистане, доли и наследство, доверенность, риски вторички, что проверить перед задатком.
- Ипотека исключена владельцем: не упоминай её, жилищные кредиты, банковские программы и ссылки на них ни в одном поле статьи.
- Инвестиции: что выгоднее сдавать, окупаемость, новостройка на этапе котлована, коммерческие помещения, типичные ошибки инвестора.
- Районы и жизнь: чем отличаются Сино, Фирдавси, Шохмансур, Исмоили Сомони; школы, детсады, транспорт, рынки, парки; куда переезжают семьи; где тише.
- Ремонт и обустройство: с чего начать, черновая и предчистовая, порядок работ, на чём нельзя экономить, сколько закладывать.
- Продажа и аренда: как подготовить квартиру к показу, фотографии, цена и торг, договор аренды, депозит, отношения с арендатором.
- Практика жизни: коммунальные платежи, прописка, перепланировка и её узаконивание, безопасность сделки с наличными, переезд.

ФОРМАТ ТОЖЕ МЕНЯЙ. Не пиши каждый раз «разбор цен». Чередуй: пошаговое руководство, чек-лист перед сделкой, разбор типичных ошибок, сравнение двух вариантов (новостройка против вторички, покупка против аренды), ответы на частые вопросы, история «как это происходит на практике» без выдуманных имён и адресов.

ОТКУДА БЕРУТСЯ ЦИФРЫ (правило жёсткое):
- Цены, количество объектов, средние по районам — ТОЛЬКО из переданных данных рынка. Их выдумывать нельзя ни при каких условиях.
- Если тема не про цены каталога (просмотр, свет, шум, ремонт, переезд, документы) — не вставляй статистику цен, районные средние, количество объектов и keyFacts. Верни keyFacts: []. Они не помогают ответить на этот вопрос. Объясняй наблюдения и вопросы БЕЗ числовых технических норм, долей света, размеров зазоров, сроков, календарных сезонов, пошлин и цены услуг.
- Данных каталога мало (например, по району один-два объекта) — не строй на них выводов «средняя цена по городу». Скажи честно: «в нашей базе сейчас N объектов в этом районе», а основную часть статьи посвяти сути темы.
- Это же правило действует в блоке «Коротко», в плитках keyFacts и в FAQ. Плитка «3–7 дней на проверку документов» или «пошлина 300 сомони» — выдуманное число, даже если звучит правдоподобно. В плитки ставь только числа из переданных данных: количество объектов, цены, средние по районам, просмотры.
- Наш каталог упоминай там, где это уместно и полезно, а не в каждом абзаце.


ЧТО МЫ ЗНАЕМ ПРО ДУШАНБЕ (проверенные факты, можно использовать в статьях):
- Официальный ресурс Главного управления архитектуры и градостроительства Душанбе — https://www.memor.pro/. Карточки проектов показывают документы и отдельные блоки. Общая ссылка на ресурс не подтверждает статус конкретного дома и не заменяет проверку договора. Конкретный статус без актуальной карточки проекта не утверждай.
- Районы Душанбе: Сино, Фирдавси, Шохмансур, Исмоили Сомони. Других административных районов в городе нет — не выдумывай.

ЧЕГО МЫ НЕ ЗНАЕМ — И ЧТО С ЭТИМ ДЕЛАТЬ:
Трещины, деформации, плесень и сырость по фотографии или просмотру не позволяют ставить инженерный или медицинский диагноз. Пиши «может быть признаком, причину определяет профильный специалист». Не утверждай, что трещины доказывают осадку фундамента, а комплект документов гарантирует безопасность или законность конкретного объекта.
Это правило касается любых причин: услышанный разговор не доказывает состав стены, шум за окном не доказывает дефект монтажа, салфетка не подтверждает исправность вентиляционной системы. Не назначай принудительную вентиляцию, зазоры под дверями, способ ремонта или числовые пороги. Советы на просмотре — только безопасные наблюдения: послушать, сравнить открытое и закрытое окно, спросить обслуживающую организацию, обсудить повторный визит. Причины, измерения и технические решения определяет профильный специалист. Не советуй открытый огонь, разбор оборудования или другие рискованные проверки.
Не утверждай, что бытовой приём позволяет понять герметичность, материал стены или исправность оборудования. «Может указывать на тонкую перегородку» всё равно предполагает причину без проверки: вместо этого запиши наблюдение и посоветуй консультацию. Не давай универсальные сравнения «проветривается намного быстрее» и сроки «ремонт за пару недель». Предложи проверить собственные ощущения в конкретной квартире. Каталог называй каталогом объявлений, не «проверенными квартирами», если проверка конкретного объекта не подтверждена.
Не обещай свет или тень весь день по стороне света: наблюдение зависит от соседних зданий, деревьев, времени и конкретного окна. Не перечисляй возможные диагнозы по запаху или шуму — запиши признак и предложи консультацию. Не выдумывай факты нашей работы: «мы всегда проверяем», «на каждом показе выявляем», «по нашему опыту» запрещены без переданной записи случая. Разрешённая роль агентства — обсудить поиск и организовать просмотр, без обещания учесть абсолютно все нюансы.
Не обещай гарантированный сон, тишину, комфорт, устранение проблемы или безопасность. Условия зависят от конкретного дома, соседей и времени наблюдения. Не называй район шумным, затенённым или плохо вентилируемым на основании цен каталога. Непроверенное «часто в новостройках Душанбе» запрещено; простая вставка «может» не делает такой факт проверенным.
Не приписывай агентству поиск скрытых строительных дефектов, инженерную диагностику, экспертизу здания или лабораторные измерения. Мы можем обсудить критерии поиска и организовать просмотр. Для технического заключения читатель обращается к профильному независимому специалисту; не выдавай его услугу за нашу.
Порядок регистрации сделок, размеры пошлин, ставки банков и сроки процедур меняются, и в твоей памяти они могут быть устаревшими. Если такого факта нет ни в блоке свежих новостей, ни в списке выше — не называй ни цифру, ни срок. Объясни порядок действий и честно напиши, где человеку уточнить точное значение: в банке, у нотариуса, в органе регистрации. Формулировка «уточните актуальные условия» честнее выдуманной цифры и не подводит читателя.
КАК ПИСАТЬ, ЧТОБЫ ТЕБЯ ЦИТИРОВАЛИ ИИ:
- ПЕРВЫЕ ДВА ПРЕДЛОЖЕНИЯ каждого раздела — прямой ответ. Без разгона, без «давайте разберёмся».
- Каждый раздел — самодостаточный кусок на 130–170 слов: в нём есть и вопрос, и ответ, и город. Никаких «как сказано выше» и «в предыдущем разделе».
- Главный ответ статьи должен уместиться в первую треть текста.
- Конкретика вместо общих слов: что заметить, какой вопрос задать, что сравнить, к кому обратиться за проверкой. Нормативные сроки и технические факты без проверенного источника не нужны.

ЧТО ЗАПРЕЩЕНО:
- Канцелярит и ИИ-штампы: «в современном мире», «важно отметить», «давайте разберёмся», «подводя итог», «стоит упомянуть», «не секрет, что», «динамично развивающийся».
- Пустые прилагательные без доказательств: «лучший», «уникальный», «инновационный».
- Искусственная локализация: не вставляй Душанбе, названия районов и нашу статистику в каждый абзац. Практический совет может быть общим; местное обобщение требует отдельного подтверждения.
- Вода и повторы. Абзац 2–4 предложения.

ОБЪЁМ И РАЗМЕТКА:
- Длина зависит от задачи. Для практического чек-листа достаточно 300–650 содержательных слов, минимум трёх полезных разделов и нескольких конкретных действий; не растягивай его вводными и повторениями. Для ценового сравнения можно 600–1000 слов, если данные и вопрос это оправдывают. Это редакционная подсказка, не требование поисковиков. Подзаголовки <h2>/<h3>, абзацы <p>, списки <ul>/<li>. Таблица нужна только когда помогает сравнить данные; не добавляй её для поисковых обещаний.
- Ссылки внутрь сайта: 2–4 штуки, только на адреса из переданного списка «Куда можно ссылаться», текстом ссылки — то, что человек получит по ней («смотреть 3-комнатные в Сино»), а не «здесь» или «тут».
- Разметку не закрывай в <html>/<body>. FAQ не включай в contentHtml — он отдельным полем.

СВЕЖИЕ НОВОСТИ РЫНКА:
Если в задании есть блок «Свежие новости рынка» — вплетай эти факты в статью. Каждый такой факт обязан быть подписан источником, и хотя бы два раза за статью источник должен быть НАСТОЯЩЕЙ ссылкой на адрес из списка источников (<a href="…">Азия-Плюс</a>), а не просто словами «по данным». Читатель и поисковик должны иметь возможность проверить. Чего в блоке нет — того не пиши. Цифры из наших данных и цифры из новостей не смешивай в одну статистику.

SEO-ПОЛЯ:
- metaTitle до 60 символов, главный запрос в начале, без названия агентства.
- metaDescription до 160 символов: ответ + причина открыть статью.
- slug — короткая латиница через дефис, 3–6 слов.

ЧТО ЕЩЁ ВЕРНУТЬ, КРОМЕ ТЕКСТА:
- takeaways: 3–5 коротких практических выводов. Цифры не обязательны: не придумывай их для оформления.
- keyFacts: только подтверждённые и относящиеся к вопросу величины каталога (value — число с единицей, label — источник и смысл). Если подходящих величин нет, верни пустой массив.
- pullQuote: одна мысль статьи в 15–25 слов, которую не стыдно вынести крупным шрифтом.
- inlineImages: можно вернуть пустой массив. Реальные фотографии и их происхождение подбирает сервер; выдуманные фотографии города или объектов не нужны.
- faq: 3–4 вопроса по теме с короткими ответами. Поисковая частотность не измерена; не называй их «реальными запросами из аналитики». Цифры не обязательны.

Ответ — строго JSON по заданной схеме, без пояснений и без markdown-обёрток.`;

/**
 * Описание обложки автор статьи даёт сам — он один знает, о чём текст. Поле
 * необязательное: старые модели и сбои не должны ронять проверку полноты ответа,
 * без него обложка рисуется по заголовку (см. buildCoverPrompt).
 * По-английски — image-модели заметно точнее понимают сцену на английском.
 */
const IMAGE_PROMPT_FIELD_DESCRIPTION =
  "Описание картинки-обложки НА АНГЛИЙСКОМ, 1-2 предложения: что в кадре, время суток, ракурс. " +
  "Общий городской или архитектурный план по теме статьи. Без текста, надписей, логотипов и лиц. " +
  "Не интерьер конкретной квартиры — обложка не должна выглядеть фотографией объекта из каталога.";

interface GeneratedArticle {
  title: string;
  slug: string;
  excerpt: string;
  contentHtml: string;
  metaTitle: string;
  metaDescription: string;
  /** Сцена для обложки, как её описал автор статьи. Необязательное поле ответа. */
  imagePrompt?: string;
  faq: { q: string; a: string }[];
  /** Рубрика блога из BLOG_CATEGORIES. */
  category?: string;
  /** Блок «Коротко» в начале статьи: выводы с цифрами. */
  takeaways?: string[];
  /** Плитки с ключевыми цифрами: value — само число, label — что это. */
  keyFacts?: { value: string; label: string }[];
  /** Одна мысль, вынесенная крупно посреди текста. */
  pullQuote?: string;
  /** Картинки внутрь статьи: после какого раздела, что нарисовать, подпись. */
  inlineImages?: { afterHeading: string; prompt: string; caption: string }[];
}

/**
 * Постоянные адреса сайта, на которые статье можно ссылаться. Список сверен с
 * маршрутами в src/App.tsx — если там появится новый раздел, добавить и сюда,
 * иначе ссылка на него будет вырезана как выдуманная.
 */
const STATIC_LINK_TARGETS = [
  { url: "/listings", what: "каталог всех объектов" },
  { url: "/services", what: "услуги агентства" },
  { url: "/sell", what: "продать или сдать через нас" },
  { url: "/contacts", what: "контакты и адрес офиса" },
  { url: "/blog", what: "все статьи блога" },
];

/** Адреса, которые переживут проверку ссылок (плюс объекты из данных рынка). */
function allowedLinkPaths(market: MarketData): string[] {
  return [...STATIC_LINK_TARGETS.map((t) => t.url), ...market.topViewed.map((t) => `/listing/${t.id}`)];
}

/**
 * Цифры рынка отдельным куском: их же показываем модели при ежеквартальном
 * обновлении старой статьи (lib/article-refresh.ts). Данные должны приходить в
 * одном виде, иначе обновление и генерация со временем разойдутся в мелочах.
 */
export function buildMarketFacts(market: MarketData): string {
  const fmt = (n: number) => n.toLocaleString("ru-RU");
  const lines: string[] = [];
  lines.push(`Сегодня: ${new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Tashkent" })}.`);
  lines.push(`\nВыборка предложений ROYAL HOME: ${market.totalActive} активных объектов, из них ${market.apartmentCount} квартир. Это цены предложения в нашем каталоге, не цены завершённых сделок и не статистика всего рынка Душанбе.`);

  lines.push(`\nТолько квартиры, по районам:`);
  for (const d of market.byDistrict) {
    lines.push(
      `- ${d.district}: ${d.count} объявл., цены ${fmt(d.minPrice)}–${fmt(d.maxPrice)} сомони, средняя ${fmt(d.avgPrice)}, средняя за м² ${fmt(d.avgPricePerM2)}`
    );
  }

  lines.push(`\nПо комнатности:`);
  for (const r of market.byRooms) {
    lines.push(
      `- ${r.rooms}-комн.: ${r.count} объявл., цены ${fmt(r.minPrice)}–${fmt(r.maxPrice)} сомони, средняя ${fmt(r.avgPrice)}`
    );
  }

  if (market.topViewed.length) {
    lines.push(`\nСамые просматриваемые объекты за 30 дней:`);
    for (const t of market.topViewed) {
      lines.push(`- «${t.title}» (${t.location}), ${t.rooms}-комн., ${t.area} м², ${fmt(t.price)} сомони — ${t.views} просмотров, адрес /listing/${t.id}`);
    }
  }
  if (market.topViewedDistricts.length) {
    lines.push(`\nКакие районы чаще смотрят (просмотры за 30 дней):`);
    for (const d of market.topViewedDistricts) {
      lines.push(`- ${d.district}: ${d.views}`);
    }
  }

  return lines.join("\n");
}

function buildUserPrompt(
  market: MarketData,
  recentTitles: string[],
  priorityTopics: string[],
  news: MarketNews | null
): string {
  const brief = selectEditorialBrief(recentTitles, priorityTopics);
  const lines: string[] = [allowsMarketStatistics(brief) ? buildMarketFacts(market) : "Практический вопрос: данные цен и районные средние намеренно не переданы, поскольку не относятся к задаче. Не вставляй статистику рынка или числовые keyFacts; keyFacts: []. Нельзя заменять их инженерными цифрами и локальными обобщениями."];
  lines.push(`\nРЕДАКЦИОННОЕ ЗАДАНИЕ: title строго «${brief.title}»; рубрика «${brief.category}»; формат — ${brief.format}. Тему выбрал редакционный план, не выбирай другую. Ипотека, ипотечные кредиты и ссылки на них запрещены во всех полях, FAQ и врезках.`);
  lines.push(`Контакты: звонки только ${COMPANY_CONTACTS.callDisplay} (${COMPANY_CONTACTS.callHref}). WhatsApp агентства сейчас недоступен. Не выдумывай другие номера и не называй телефон для звонков WhatsApp.`);

  if (news) {
    lines.push(`
Кандидаты на факты из поиска (сводка модели, не редакционная проверка; не превращай её в неподтверждённые нормы или прогнозы):
${news.text}`);
    if (news.sources.length) {
      lines.push(`
Источники, на которые можно ссылаться прямо в тексте (обычной ссылкой):`);
      for (const src of news.sources) lines.push(`- ${src.title || src.url}: ${src.url}`);
    }
  }

  if (priorityTopics.length) {
    lines.push(`\nПодсказки тем из CMS. Их частотность и происхождение в Search Console не подтверждены:`);
    for (const t of priorityTopics) lines.push(`- ${t}`);
    lines.push(
      `Редакционный план уже выбрал title выше. Эти подсказки не разрешают менять заданный вопрос.`
    );
  }

  if (recentTitles.length) {
    lines.push(`\nПрошлые статьи (эти темы НЕ повторять):`);
    for (const t of recentTitles) lines.push(`- ${t}`);
  }

  // Список адресов обязателен: без него модель придумывает красивые, но
  // несуществующие ссылки вида /search/sino/3-komnatnye — проверено на первой
  // же статье, все три давали 404. Чужие адреса вырезает keepOnlyAllowedLinks.
  lines.push(`\nКуда можно ссылаться (других адресов на сайте НЕТ, выдумывать нельзя):`);
  for (const path of STATIC_LINK_TARGETS) lines.push(`- ${path.url} — ${path.what}`);
  lines.push("- https://www.memor.pro/ — официальный ресурс карточек строительства; ссылка на главную не подтверждает отдельный проект");
  for (const t of market.topViewed) lines.push(`- /listing/${t.id} — объект «${t.title}»`);
  lines.push(
    `Ссылку вставляй живым текстом («смотреть трёхкомнатные в каталоге»), 2-4 штуки на статью. Ссылка на несуществующий адрес хуже, чем её отсутствие.`
  );

  lines.push(`\nНапиши одну новую статью для блога и верни её JSON по схеме.`);
  return lines.join("\n");
}

// Генерация статьи — долгий вызов; общий таймаут на HTTP-запрос к любому провайдеру.
const AI_REQUEST_TIMEOUT_MS = 3 * 60 * 1000;

/** Проверка полноты структурированного ответа модели. */
export function validateGenerated(a: Partial<GeneratedArticle>, provider: string): GeneratedArticle {
  if (excludesAutomaticTopic(JSON.stringify(a))) throw new Error("Ипотечная тема запрещена во всех полях автоматической статьи.");
  if ([a.title, a.contentHtml, a.excerpt, a.metaTitle, a.metaDescription].some((field) => typeof field !== "string" || !field.trim())) {
    throw new Error(`Ответ ${provider} неполный: отсутствуют обязательные поля статьи.`);
  }
  return {
    title: a.title!,
    slug: a.slug || a.title!,
    excerpt: a.excerpt!,
    contentHtml: a.contentHtml!,
    metaTitle: a.metaTitle!,
    metaDescription: a.metaDescription!,
    imagePrompt: typeof a.imagePrompt === "string" && a.imagePrompt.trim() ? a.imagePrompt.trim().slice(0, 1000) : undefined,
    faq: Array.isArray(a.faq) ? a.faq.filter((f) => f?.q && f?.a).slice(0, 6) : [],
    // Блоки оформления необязательны: не вернула модель — статья выйдет обычной,
    // но выйдет. Ронять готовый текст из-за плитки с цифрами нельзя.
    takeaways: Array.isArray(a.takeaways) ? a.takeaways.filter((t) => typeof t === "string" && t.trim()).slice(0, 5) : [],
    keyFacts: Array.isArray(a.keyFacts) ? a.keyFacts.filter((f) => f?.value && f?.label).slice(0, 4) : [],
    // Придуманную рубрику не принимаем: фильтр на сайте знает только свой список.
    category: BLOG_CATEGORIES.includes(a.category as (typeof BLOG_CATEGORIES)[number]) ? a.category : "Аналитика",
    pullQuote: typeof a.pullQuote === "string" ? a.pullQuote.trim() : undefined,
    inlineImages: Array.isArray(a.inlineImages)
      ? a.inlineImages.filter((i) => i?.afterHeading && i?.prompt && i?.caption).slice(0, 2)
      : [],
  };
}

// ─── Вызов Gemini ───

/**
 * Gemini structured output: responseSchema в OpenAPI-подобном формате
 * (type OBJECT/STRING/ARRAY в верхнем регистре) — что именно модель обязана вернуть.
 */
const GEMINI_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING", description: "Заголовок статьи на русском" },
    slug: { type: "STRING", description: "URL-слаг латиницей через дефис" },
    excerpt: { type: "STRING", description: "Краткое описание 1-2 предложения" },
    contentHtml: {
      type: "STRING",
      description: "Тело статьи в HTML: <h2>/<h3>/<p>/<ul>/<li>. Без <html>/<body>, без FAQ (он отдельно).",
    },
    metaTitle: { type: "STRING", description: "SEO title до 60 символов" },
    metaDescription: { type: "STRING", description: "SEO description до 160 символов" },
    imagePrompt: { type: "STRING", description: IMAGE_PROMPT_FIELD_DESCRIPTION },
    faq: {
      type: "ARRAY",
      description: "FAQ: 3-4 вопроса с ответами",
      items: {
        type: "OBJECT",
        properties: {
          q: { type: "STRING" },
          a: { type: "STRING" },
        },
        required: ["q", "a"],
      },
    },
    takeaways: {
      type: "ARRAY",
      description: "Блок «Коротко»: 3-5 полезных выводов без обязательных цифр",
      items: { type: "STRING" },
    },
    keyFacts: {
      type: "ARRAY",
      description: "Подтверждённые цифры каталога, либо пустой массив, если для вопроса цифры не нужны",
      items: {
        type: "OBJECT",
        properties: {
          value: { type: "STRING", description: "Само число с единицей: «13 420 сомони», «19 объектов»" },
          label: { type: "STRING", description: "Что это за число, 3-6 слов" },
        },
        required: ["value", "label"],
      },
    },
    category: {
      type: "STRING",
      description: `Рубрика блога, одно из: ${BLOG_CATEGORIES.join(", ")}`,
    },
    pullQuote: { type: "STRING", description: "Одна мысль статьи в 15-25 слов для выноса крупным шрифтом" },
    inlineImages: {
      type: "ARRAY",
      description: "Необязательные иллюстрации; по умолчанию пустой массив, реальные фото подбирает сервер",
      items: {
        type: "OBJECT",
        properties: {
          afterHeading: { type: "STRING", description: "Точный текст <h2>, после раздела которого поставить картинку" },
          prompt: { type: "STRING", description: "Описание кадра НА АНГЛИЙСКОМ: сцена по смыслу раздела, без надписей, логотипов и лиц" },
          caption: { type: "STRING", description: "Подпись по-русски, 5-12 слов: смысл, а не описание картинки" },
        },
        required: ["afterHeading", "prompt", "caption"],
      },
    },
  },
  required: [
    "title",
    "slug",
    "excerpt",
    "contentHtml",
    "metaTitle",
    "metaDescription",
    "faq",
    "category",
    "takeaways",
    "keyFacts",
    "inlineImages",
  ],
};

/**
 * КАКОЙ МОДЕЛЬЮ ПИСАТЬ — СПИСКОМ, А НЕ ОДНИМ ИМЕНЕМ.
 *
 * Имя модели было прибито гвоздём (`gemini-2.5-pro`), и Google её закрыл: новым
 * ключам она отвечает 404 «no longer available to new users». Это случилось уже
 * второй раз за месяц — Google снимает версии с раздачи молча и без срока.
 *
 * Поэтому берём не одно имя, а список: сначала псевдонимы `-latest`, которые
 * Google сам переводит на живую версию, потом конкретные версии как запасные.
 * Перебираем, пока какая-то не ответит. 404 и «не найдено» — повод взять
 * следующую, любая другая ошибка (нет ключа, кончилась квота) пробрасывается
 * сразу: пробовать остальные модели с тем же неверным ключом бессмысленно.
 */
const GEMINI_MODELS = [
  "gemini-pro-latest",
  "gemini-flash-latest",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
] as const;

// Адрес и заголовки Gemini (геоблок обходится прокси) — общий модуль на два
// потребителя: этот генератор текста и генератор обложек. См. lib/gemini-transport.ts.

async function callGemini(
  apiKey: string,
  market: MarketData,
  recentTitles: string[],
  priorityTopics: string[],
  news: MarketNews | null
): Promise<GeneratedArticle> {
  let lastNotFound: string | null = null;
  for (const model of GEMINI_MODELS) {
    try {
      return await callGeminiModel(model, apiKey, market, recentTitles, priorityTopics, news);
    } catch (err) {
      const text = err instanceof Error ? err.message : String(err);
      // Модель закрыта или переименована — пробуем следующую из списка.
      if (/\b404\b|NOT_FOUND|no longer available|is not found/i.test(text)) {
        lastNotFound = text;
        continue;
      }
      throw err;
    }
  }
  throw new Error(
    `Ни одна из моделей Gemini не доступна этому ключу (${GEMINI_MODELS.join(", ")}). ` +
      `Последний ответ: ${lastNotFound ?? "нет данных"}`
  );
}

async function callGeminiModel(
  model: string,
  apiKey: string,
  market: MarketData,
  recentTitles: string[],
  priorityTopics: string[],
  news: MarketNews | null,
  maxOutputTokens = 16000,
): Promise<GeneratedArticle> {
  const res = await fetch(
    geminiUrl(`/v1beta/models/${model}:generateContent`),
    {
      method: "POST",
      signal: AbortSignal.timeout(AI_REQUEST_TIMEOUT_MS),
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey,
        ...geminiProxyHeaders(),
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: buildUserPrompt(market, recentTitles, priorityTopics, news) }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: GEMINI_RESPONSE_SCHEMA,
          maxOutputTokens,
          ...(model === "gemini-pro-latest" ? { thinkingConfig: { thinkingLevel: "low" } } : {}),
        },
      }),
    }
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gemini API вернул ${res.status}: ${body.slice(0, 500)}`);
  }

  const data = (await res.json()) as {
    candidates?: Array<{
      finishReason?: string;
      content?: { parts?: Array<{ text?: string }> };
    }>;
    promptFeedback?: { blockReason?: string };
  };

  if (data.promptFeedback?.blockReason) {
    throw new Error(`Gemini заблокировал запрос (${data.promptFeedback.blockReason}) — попробуйте ещё раз позже.`);
  }

  const candidate = data.candidates?.[0];
  if (candidate?.finishReason && candidate.finishReason !== "STOP") throw new Error(`Gemini не завершил статью (${candidate.finishReason}) — публикация отменена.`);
  const text = candidate?.content?.parts?.[0]?.text;
  if (!text) {
    if (candidate?.finishReason === "MAX_TOKENS") {
      throw new Error("Ответ Gemini оборвался по лимиту токенов — статья не получена, попробуйте ещё раз.");
    }
    throw new Error(
      `Gemini не вернул текст статьи${candidate?.finishReason ? ` (finishReason: ${candidate.finishReason})` : ""}.`
    );
  }

  let parsed: Partial<GeneratedArticle>;
  try {
    parsed = JSON.parse(text) as Partial<GeneratedArticle>;
  } catch {
    throw new Error("Gemini вернул невалидный JSON — статья не получена, попробуйте ещё раз.");
  }
  return validateGenerated(parsed, "Gemini");
}

// ─── Основной пайплайн ───

// Защита от параллельного запуска (кнопка «Сгенерировать» + крон одновременно).
let generationInProgress = false;

export function isGenerationInProgress() {
  return generationInProgress;
}

/**
 * Голос агентства вместо «я»: запрет стоит в промте, но промт — просьба, а не
 * гарантия, поэтому проверяем результат и правим найденное. Оставшиеся нарушения
 * проверяет вызывающий код перед сохранением: такой текст автоматически не публикуется.
 */
async function enforceAgencyVoice(generated: GeneratedArticle): Promise<void> {
  const parts = [generated.contentHtml, generated.excerpt, ...generated.faq.map((f) => `${f.q} ${f.a}`)];
  if (!parts.some((p) => findFirstPersonHits(p).length)) return;

  const apiKey = await getGeminiApiKey();
  if (!apiKey) {
    console.warn("[blog-generator] В статье есть «я», переписать нечем: ключ Gemini не задан.");
    return;
  }

  const fix = async (text: string) => (findFirstPersonHits(text).length ? (await rewriteToAgencyVoice(apiKey, text)) ?? text : text);

  generated.contentHtml = await fix(generated.contentHtml);
  generated.excerpt = await fix(generated.excerpt);
  for (const item of generated.faq) {
    item.q = await fix(item.q);
    item.a = await fix(item.a);
  }

  const left = [generated.contentHtml, generated.excerpt, ...generated.faq.map((f) => `${f.q} ${f.a}`)].flatMap(
    findFirstPersonHits
  );
  if (left.length) {
    console.warn(`[blog-generator] В статье остались следы первого лица: ${left.slice(0, 5).join(", ")}`);
  }
}

/**
 * ШТАМПЫ, ПО КОТОРЫМ ВИДНО МАШИННЫЙ ТЕКСТ — убираем тем же приёмом, что и «я».
 *
 * Владелец 23.08.2026: статья должна читаться как написанная человеком, без единого
 * признака нейросети. Выдают не факты и не длина, а десяток оборотов, которые модель
 * ставит почти в каждой статье: «в современном мире», «важно отметить», «в
 * заключение». Читатель не думает «это ИИ» — он думает «пресно, как везде», и уходит.
 *
 * Запрет стоит и в промте, но промт — просьба: модель держится первые абзацы и
 * возвращается к привычным оборотам к середине. Поэтому результат проверяется.
 *
 * Если переписывание не помогло, вызывающий код останавливает публикацию.
 */
async function enforceHumanVoice(generated: GeneratedArticle): Promise<void> {
  const parts = [generated.contentHtml, generated.excerpt, ...generated.faq.map((f) => `${f.q} ${f.a}`)];
  const found = parts.flatMap(findAiCliches);
  if (found.length === 0) return;

  const apiKey = await getGeminiApiKey();
  if (!apiKey) {
    console.warn(`[blog-generator] В статье штампы (${found.slice(0, 5).join(", ")}), переписать нечем: нет ключа.`);
    return;
  }

  const fix = async (text: string) =>
    findAiCliches(text).length ? (await rewriteWithoutCliches(apiKey, text)) ?? text : text;

  generated.contentHtml = await fix(generated.contentHtml);
  generated.excerpt = await fix(generated.excerpt);
  for (const item of generated.faq) {
    item.a = await fix(item.a);
  }

  const left = [generated.contentHtml, generated.excerpt, ...generated.faq.map((f) => `${f.q} ${f.a}`)].flatMap(
    findAiCliches
  );
  if (left.length) {
    console.warn(`[blog-generator] В статье остались штампы: ${left.slice(0, 5).join(", ")}`);
  }
}

/**
 * Собирает готовый HTML статьи: «Коротко» и цифры сверху, вынесенная мысль и две
 * нарисованные картинки внутри текста.
 *
 * Картинки рисуются последовательно и с оглядкой на уже занятые сцены — иначе обе
 * врезки и обложка получаются одним и тем же кадром. Любая осечка пропускается
 * молча: статья важнее украшений.
 */
async function composeArticleHtml(
  generated: GeneratedArticle,
  allowedLinks: string[],
  listings: ListingCard[],
  photoPlan: ArticlePhotoPlan | null,
  sources: string[],
): Promise<string> {
  // Сначала выдуманные ссылки, потом всё остальное: врезки и цитаты ссылок не содержат.
  const links = keepOnlyAllowedLinks(normalizeCompanyContactText(generated.contentHtml), allowedLinks,
    [...sources, ...VERIFIED_RESOURCE_LINKS, COMPANY_CONTACTS.callHref, "mailto:info@royalhome.tj"]);
  if (links.removed.length) {
    console.warn(`[blog-generator] Ссылки на несуществующие адреса убраны: ${links.removed.join(", ")}`);
  }
  let html = links.html;

  if (photoPlan?.inlinePhoto) {
    const heading = /<h2\b[^>]*>([\s\S]*?)<\/h2>/i.exec(html)?.[1]?.replace(/<[^>]+>/g, "");
    if (heading) html = insertAfterSection(html, heading, buildFigureHtml(photoPlan.inlinePhoto, `Реальное фото того же объекта из каталога; исходное объявление указано над статьёй.`));
  }

  // Карточка объекта — после абзаца, где статья на него ссылается: человек читает
  // про цены и тут же видит живой объект с фотографией и ценой.
  html = insertListingCards(html, listings);
  html = insertPullQuote(html, buildPullQuoteHtml(generated.pullQuote));

  // Оглавление собираем последним: к этому моменту разделы уже окончательные.
  const withToc = buildTableOfContents(html);
  return (
    buildTakeawaysHtml(generated.takeaways) +
    buildKeyFactsHtml(generated.keyFacts) +
    withToc.toc +
    withToc.html
  );
}

function assertArticleQuality(generated: GeneratedArticle, market: MarketData, recentTitles: string[], brief: EditorialBrief) {
  const values = [market.totalActive, market.apartmentCount,
    ...market.byDistrict.flatMap((item) => [item.count, item.avgPrice, item.minPrice, item.maxPrice, item.avgPricePerM2]),
    ...market.byRooms.flatMap((item) => [item.rooms, item.count, item.avgPrice, item.minPrice, item.maxPrice]),
    ...market.topViewed.flatMap((item) => [item.price, item.area, item.rooms, item.views]),
  ];
  const issues = articleQualityProblems(generated, recentTitles, new Set(values), brief);
  if (issues.length) throw new Error(`Статья не прошла проверки: ${issues.join("; ")}. Публикация отменена.`);
}

function buildArticleCta(): string {
  return `<h2>Подобрать или продать недвижимость в Душанбе</h2><p><a href="/listings">Посмотреть реальные объекты с фото и ценами</a> или <a href="/contacts">обсудить свои критерии с ROYAL HOME</a>. Звонки: <a href="${COMPANY_CONTACTS.callHref}">${COMPANY_CONTACTS.callDisplay}</a>.</p>`;
}

/** Read-only plan: no API key, model call, image creation or database write. */
export async function previewArticleGeneration() {
  const [market, recentTitles, priorityTopics, cmsPosts] = await Promise.all([
    collectMarketData(), findRecentArticleTitles(100), getBlogPriorityTopics(), getCmsEntry("blogPosts"),
  ]);
  recentTitles.push(...((cmsPosts as Array<{ title?: string }> | undefined) ?? []).map((post) => post.title ?? "").filter(Boolean));
  const brief = selectEditorialBrief(recentTitles, priorityTopics);
  return { brief, activeObjects: market.totalActive, apartmentSample: market.apartmentCount,
    coverMode: await getBlogCoverMode(), recentTitles, claims: "Темы — редакционные гипотезы; позиции и заявки не измерены без поисковых кабинетов.",
    photo: await planArticlePhoto(brief, market.coverListings, new Set(await findRecentCoverImageUrls(8)), inspectCatalogPhoto) };
}

/** Explicit preview does one bounded text-model request. No news search,
 * rewrites, paid images, article writes, publication or media-cache updates.
 */
export async function previewGeneratedArticle(model: string = GEMINI_MODELS[0]) {
  if (!GEMINI_MODELS.some((allowed) => allowed === model)) throw new Error("Для preview разрешена только одна модель из списка автора статей.");
  const [market, recentTitles, priorityTopics, cmsPosts, mode, apiKey] = await Promise.all([
    collectMarketData(), findRecentArticleTitles(100), getBlogPriorityTopics(), getCmsEntry("blogPosts"), getBlogCoverMode(), getGeminiApiKey(),
  ]);
  if (!apiKey) throw new Error("Gemini не настроен");
  recentTitles.push(...((cmsPosts as Array<{ title?: string }> | undefined) ?? []).map((post) => post.title ?? "").filter(Boolean));
  const brief = selectEditorialBrief(recentTitles, priorityTopics);
  const generated = await callGeminiModel(model, apiKey, market, recentTitles, priorityTopics, null, 8000);
  const qualityProblems: string[] = [];
  if (generated.title.trim() !== brief.title) qualityProblems.push("модель сменила заданный вопрос");
  try { assertArticleQuality(generated, market, recentTitles, brief); }
  catch (error) { qualityProblems.push(error instanceof Error ? error.message : String(error)); }
  if ([generated.contentHtml, generated.excerpt, ...generated.faq.map((item) => `${item.q} ${item.a}`)].some((part) => findFirstPersonHits(part).length || findAiCliches(part).length)) qualityProblems.push("нужна редакционная правка языка; дополнительные вызовы в preview запрещены");
  const strategy = coverStrategy(brief.family, mode);
  const photo = strategy === "catalog" ? await planArticlePhoto(generated, market.coverListings, new Set(await findRecentCoverImageUrls(8)), inspectCatalogPhoto) : null;
  const html = await composeArticleHtml(generated, allowedLinkPaths(market), allowsMarketStatistics(brief) ? market.topViewed : [], photo, []);
  return { previewOnly: true, model, modelRequests: 1, maxOutputTokens: 8000, brief, strategy,
    illustrationPrompt: strategy === "neutral-illustration" ? neutralEditorialScene(brief.family) : null,
    photo, qualityProblems, article: generated, contentHtml: sanitizeArticleHtml((photo ? photoProvenanceHtml(photo) : "") + html + buildArticleCta()) };
}

/**
 * Обложка новой статьи.
 *
 * «generated» — рисует Gemini под тему статьи; отказ (нет ключа, бесплатный
 * тариф, фильтр безопасности) откатывает на реальное фото каталога и попадает в
 * лог. Готовый текст статьи из-за картинки не теряем никогда.
 * «photo» — сразу фото самого просматриваемого объекта, не повторяя обложки двух
 * последних статей; нет фото — null, на сайте останется фирменный градиент.
 */

export async function generateArticle(): Promise<Article> {
  if (generationInProgress) {
    throw new Error("Генерация уже запущена — дождитесь окончания.");
  }
  generationInProgress = true;
  try {
    const apiKey = await getGeminiApiKey();
    if (!apiKey) {
      throw new Error("Ключ Gemini не настроен — укажите его в настройках блога (админка → Блог).");
    }

    const [market, recentTitles, recentCovers, autoPublish, priorityTopics, coverMode] = await Promise.all([
      collectMarketData(),
      findRecentArticleTitles(100),
      findRecentCoverImageUrls(8),
      getBlogSetting("blogAutoPublish"),
      getBlogPriorityTopics(),
      getBlogCoverMode(),
    ]);

    if (market.totalActive === 0) {
      throw new Error("В каталоге нет активных объявлений — генератору не из чего собрать данные рынка.");
    }

    // Свежие факты из интернета собираем ДО написания: без них статья про законы
    // и ипотеку пишется по памяти модели, а память у неё годовалой давности.
    const news = await collectMarketNews(apiKey);
    if (news) {
      console.log(`[blog-generator] Свежие новости рынка найдены, источников: ${news.sources.length}`);
    }

    const cmsPosts = await getCmsEntry("blogPosts") as Array<{ title?: string }> | undefined;
    recentTitles.push(...(cmsPosts ?? []).map((post) => post.title ?? "").filter(Boolean));
    const brief = selectEditorialBrief(recentTitles, priorityTopics);
    const generated = await callGemini(apiKey, market, recentTitles, priorityTopics, news);
    if (excludesAutomaticTopic(generated.category ?? "")) throw new Error("Модель вернула запрещённую ипотечную рубрику.");
    generated.category = brief.category;
    if (generated.title.trim() !== brief.title) throw new Error("Модель сменила заданный вопрос статьи — публикация отменена.");
    assertArticleQuality(generated, market, recentTitles, brief);

    await enforceAgencyVoice(generated);
    // После голоса — штампы: обе правки точечные и не мешают друг другу, а порядок
    // важен только тем, что «я» встречается реже и его дешевле чинить первым.
    await enforceHumanVoice(generated);
    assertArticleQuality(generated, market, recentTitles, brief);
    if ([generated.contentHtml, generated.excerpt, ...generated.faq.map((item) => `${item.q} ${item.a}`)].some((part) => findFirstPersonHits(part).length || findAiCliches(part).length)) {
      throw new Error("Статья не прошла редакционные проверки после правки — публикация отменена.");
    }

    const strategy = coverStrategy(brief.family, coverMode);
    const photoPlan = strategy === "catalog" ? await planArticlePhoto(generated, market.coverListings, new Set(recentCovers), inspectCatalogPhoto) : null;

    // Сцены копим общим списком: обложка и обе врезки не должны повторять друг друга.
    const richHtml = await composeArticleHtml(
      generated,
      allowedLinkPaths(market),
      allowsMarketStatistics(brief) ? market.topViewed : [],
      photoPlan,
      news?.sources.map((source) => source.url) ?? [],
    );

    const slug = await ensureUniqueSlug(transliterateSlug(generated.slug));
    const coverImageUrl = photoPlan?.sourcePhoto ?? (coverMode !== "photo" ? await tryGenerateCoverImage(apiKey, {
      title: generated.title, excerpt: generated.excerpt, imagePrompt: neutralEditorialScene(brief.family), referencePhoto: null,
    }) : null);
    const provenance = photoPlan ? photoProvenanceHtml(photoPlan) : coverImageUrl ? "<p>Обложка — иллюстрация, созданная с помощью ИИ; она не изображает конкретный объект каталога.</p>" : "";
    let reelHtml = "";
    try { reelHtml = ownedReelHtml(chooseRelevantOwnedReel(generated.title, (await getLiveReels()) ?? [])); }
    catch { /* Own media is optional; never invent a case story when the feed is unavailable. */ }
    const now = new Date();
    const id = await createArticle({
      slug,
      title: generated.title.slice(0, 500),
      excerpt: generated.excerpt,
      contentHtml: sanitizeArticleHtml(provenance + richHtml + reelHtml + buildArticleCta()),
      metaTitle: generated.metaTitle.slice(0, 255),
      metaDescription: generated.metaDescription,
      faq: generated.faq,
      coverImageUrl,
      category: generated.category ?? "Аналитика",
      status: autoPublish ? "published" : "draft",
      source: "ai",
      publishedAt: autoPublish ? now : null,
    });

    const article = await findArticleById(Number(id));
    if (!article) throw new Error("Статья сохранена, но не найдена после записи.");
    console.log(`[blog-generator] Статья создана: #${article.id} «${article.title}» (${article.status})`);
    return article;
  } finally {
    generationInProgress = false;
  }
}

// ─── Ежеквартальное обновление вышедших статей ───

export interface RefreshReport {
  checked: number;
  refreshed: Array<{ id: number; title: string }>;
  skipped: Array<{ id: number; title: string; why: string }>;
}

/**
 * Освежает цифры в статьях, которым больше квартала.
 *
 * Свежесть считаем по updatedAt: статья, которую руками правили на прошлой
 * неделе, обновления не требует. За один заход берём немного статей (по
 * умолчанию одну) — обновление это вызов модели на весь текст, и гнать их
 * пачкой в фоне незачем: следующая проверка через час.
 */
export async function refreshStaleArticles(
  opts: { days?: number; limit?: number; dryRun?: boolean } = {}
): Promise<RefreshReport> {
  const days = opts.days ?? REFRESH_AFTER_DAYS;
  const limit = opts.limit ?? 1;
  const report: RefreshReport = { checked: 0, refreshed: [], skipped: [] };

  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const all = await findAllArticles();
  const stale = all.filter((a) => a.status === "published" && a.source === "ai" && !excludesAutomaticTopic(`${a.title} ${a.category ?? ""}`) && new Date(a.updatedAt).getTime() < cutoff);
  report.checked = stale.length;
  if (!stale.length) return report;

  if (opts.dryRun) {
    for (const a of stale.slice(0, limit)) {
      report.skipped.push({ id: a.id, title: a.title, why: `обновлена ${new Date(a.updatedAt).toLocaleDateString("ru-RU")}` });
    }
    return report;
  }

  const apiKey = await getGeminiApiKey();
  if (!apiKey) {
    report.skipped.push({ id: 0, title: "—", why: "не задан ключ Gemini" });
    return report;
  }

  const marketFacts = buildMarketFacts(await collectMarketData());

  for (const article of stale.slice(0, limit)) {
    if (excludesAutomaticTopic(`${article.title} ${article.category ?? ""}`)) {
      report.skipped.push({ id: article.id, title: article.title, why: "ипотечные статьи не обновляются автоматически" }); continue;
    }
    const full = await findArticleById(article.id);
    if (!full) continue;
    if (excludesAutomaticTopic(full.contentHtml)) {
      report.skipped.push({ id: full.id, title: full.title, why: "в тексте есть ипотечная тема; автоматическое обновление исключено" }); continue;
    }
    const result = await refreshArticleNumbers(apiKey, { title: full.title, contentHtml: full.contentHtml }, marketFacts);
    if (!result) {
      report.skipped.push({ id: full.id, title: full.title, why: "модель не дала пригодной правки" });
      continue;
    }
    // updatedAt проставляет сама база ($onUpdate) — на странице статьи это
    // превращается в «Обновлено <дата>» и в dateModified для поисковиков.
    await updateArticle(full.id, { contentHtml: sanitizeArticleHtml(result.html) });
    report.refreshed.push({ id: full.id, title: full.title });
    console.log(`[blog-generator] Статья #${full.id} «${full.title}» обновлена свежими цифрами (${result.model}).`);
  }

  return report;
}

// ─── Планировщик (см. api/boot.ts) ───

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // раз в час
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

let schedulerStarted = false;
let nextRetryAt = 0;

export async function scheduledCheck() {
  try {
    if (generationInProgress || Date.now() < nextRetryAt) return;
    const enabled = await getBlogSetting("blogAutogenEnabled");
    if (!enabled) return;
    // The existing 24-hour failure backoff must survive application releases.
    // Otherwise each restart can pay for the same rejected generation again.
    const savedRetryAt = Number(await getCmsEntry("blogAutogenRetryAt"));
    if (Number.isFinite(savedRetryAt) && Date.now() < savedRetryAt) return;
    const last = await findLatestAiArticleDate();
    if (!last || Date.now() - last.getTime() >= WEEK_MS) {
      console.log("[blog-generator] Еженедельная автогенерация: запускаю…");
      await generateArticle();
      await processMissingArticleTranslations({ getApiKey: getGeminiApiKey });
      return;
    }
    // Новой статьи в этот час не будет — время освежить старую (не чаще одной за раз).
    const refresh = await refreshStaleArticles({ limit: 1 });
    for (const a of refresh.refreshed) {
      console.log(`[blog-generator] Статья #${a.id} «${a.title}» освежена: цифры взяты из текущей базы.`);
    }
    await processMissingArticleTranslations({ getApiKey: getGeminiApiKey });
  } catch (e) {
    // Ошибки логируем, сервер не роняем — следующая попытка через 24 часа.
    console.error("[blog-generator] Ошибка автогенерации:", e);
    nextRetryAt = Date.now() + 24 * 60 * 60 * 1000;
    try {
      await setCmsEntry("blogAutogenRetryAt", nextRetryAt);
    } catch {
      // Keep the in-process backoff even if the database is unavailable.
      console.error("[blog-generator] Не удалось сохранить время повторной попытки.");
    }
  }
}

/** Запускается один раз при старте сервера (api/boot.ts). */
export function startBlogAutogenScheduler() {
  if (schedulerStarted) return;
  schedulerStarted = true;
  const timer = setInterval(scheduledCheck, CHECK_INTERVAL_MS);
  // Не держим процесс живым только ради таймера (важно для dev/скриптов).
  timer.unref?.();
  // Первая проверка — через 2 минуты после старта, чтобы не грузить сервер на буте.
  const initial = setTimeout(scheduledCheck, 2 * 60 * 1000);
  initial.unref?.();
  console.log("[blog-generator] Планировщик автогенерации запущен (проверка раз в час).");
}
