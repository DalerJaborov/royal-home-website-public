import { CORE_PAGE_SEO } from '@contracts/core-page-seo';
import { ARTICLE_FINANCE_NOTE, isFinancialArticle } from '@contracts/article-finance-note';
import { articleCoverCredit } from '@contracts/article-cover-credits';
import { historicalArticleMediaDisclosure, HISTORICAL_COVER_NOTE, HISTORICAL_BODY_IMAGES_NOTE } from '@contracts/article-media-disclosure';
import { translationSourceHash } from './public-translations';
import { sellGuideHtml } from './sell-guide';
import { contactActionsHtml } from './contact-actions';
import { videoWatchHead } from './video-watch-head';
import { listingVideoContentUrl, VIDEO_COPY } from '@contracts/listing-video';
/**
 * Серверная инъекция SEO в index.html (фаза 3). Клиентский useSeo обновляет
 * теги через JS — этого достаточно для Google, но НЕ для скрейперов превью-ссылок
 * (Telegram/WhatsApp/Facebook) и краулеров без JS: они читают только исходный
 * HTML. Здесь мы на сервере подставляем в этот HTML правильные title/description/
 * og/canonical и per-page JSON-LD ещё до отдачи — так ссылка на объект или статью
 * получает корректное превью в мессенджерах.
 *
 * Публичные объекты и статьи получают также видимый начальный HTML из тех же
 * данных, что использует SPA. Ошибка данных возвращает 503 для повторной попытки.
 */
import { findListingById, findAllListings } from "../queries/listings";
import { getCmsEntry } from "../queries/cms";
import { findPublishedArticleBySlug, findPublishedArticles } from "../queries/articles";
import { buildListingSeoMeta } from "./seo";
import { findServiceSeo, SERVICE_SEO } from "@contracts/services-seo";
import { MORTGAGE_FAQ } from "@contracts/faq-seo";
import { ogImageUrl } from "./ogImage";
import { sanitizeArticleHtml } from "./sanitize-html";
import { catalogNeedsNoindex } from "@contracts/catalog-seo";
import { matchesSearch } from "./searchTokens";
import { listingJsonLd } from "@contracts/listing-jsonld";
import { COMPANY_HOURS, normalizeCompanyContactText } from '@contracts/company-contacts';
import { resolvePublicPath, type PublicLocale, type LocaleAlternate } from '@contracts/public-i18n';
import { localizeHead } from './localized-seo';
import { catalogCoverPreload } from './catalog-preload';
import { listingSeoTitle } from '@contracts/listing-seo-title';
import { projectPublicListing, type PublicListing } from '@contracts/public-listing';
import { CATALOG_BOOTSTRAP_ID, LISTING_BOOTSTRAP_ID, serializeCatalogBootstrap, serializeListingBootstrap } from '@contracts/catalog-bootstrap';
import { listingFactsHtml } from './listing-facts';
import { districtFromPath, isInventoryPage } from '@contracts/district-catalog';
import { districtPageData, districtNavigationHtml } from './district-catalog';

const SITE_ORIGIN = "https://royalhome.tj";
const DEFAULT_TITLE = "Купить квартиру в Душанбе | ROYAL HOME — Недвижимость";
const DEFAULT_DESC =
  "ROYAL HOME — агентство недвижимости в Душанбе. Квартиры с фото и ценами, контакты риелторов и сопровождение сделок.";
const DEFAULT_IMAGE = `${SITE_ORIGIN}/og-image.jpg`;

export interface Head {
  title: string;
  description: string;
  image: string;
  url: string;
  type: "website" | "article" | "product";
  jsonLd?: object | object[] | null;
  noindex?: boolean;
  /** HTTP-статус для отдачи HTML (404 для несуществующих сущностей — иначе soft-404). */
  status?: 200 | 404 | 503;
  /** Visible initial HTML from the same public data as the SPA. React replaces it on mount. */
  body?: string;
  hydrate?: boolean;
  language?: PublicLocale;
  alternates?: LocaleAlternate[];
  /** Exact initial catalog cover; computed from the same public inventory as body. */
  preloadImage?: string;
  /** Already-read public inventory, also reused by localized catalogue HTML. */
  catalogInventory?: readonly PublicListing[];
  publicListing?: PublicListing;
}

interface SiteSeoSettings {
  pageSeo?: Record<string, { title?: string; description?: string; h1?: string }>;
  phone?: string;
  email?: string;
  address?: string;
  workHours?: string;
}

function absUrl(u: string | undefined | null, fallback: string): string {
  if (!u) return fallback;
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  return `${SITE_ORIGIN}${u.startsWith("/") ? "" : "/"}${u}`;
}

// Статические страницы: заголовки совпадают с дефолтами клиентского CMS.
// RU исходник не содержит таджикские ключевые приписки: TG/EN публикуются
// по отдельным языковым URL только после проверки перевода.
const STATIC_PAGES = CORE_PAGE_SEO;

async function headForListing(id: number, url: string): Promise<Head | null> {
  const listing = await findListingById(id);
  // Снятый с публикации объект — то же самое, что несуществующий: 404 и noindex.
  // findListingById по published не фильтрует, поэтому объект, снятый директором
  // с продажи в CRM, продолжал отдавать 200, index/follow, реальный заголовок,
  // цену в og:description, фото и Product-разметку с наличием. В индексе и в
  // превью мессенджеров он оставался живым, а тело SPA при этом честно показывало
  // «Объект не найден»: человек видел цену в превью и пустую страницу по клику.
  // listing-router.ts:82 для того же случая намеренно отвечает NOT_FOUND.
  if (!listing || listing.published === false) return null;
  const seo = buildListingSeoMeta({
    title: listing.title,
    location: listing.location,
    price: listing.price,
    rooms: listing.rooms,
    area: listing.area,
    type: listing.type ?? undefined,
    category: listing.category,
    district: listing.location.split(",")[0]?.trim(),
  });
  const title = listingSeoTitle(listing.sold ? `Продано: ${listing.title} — ROYAL HOME` : listing.metaTitle?.trim() || seo.metaTitle, listing.crmShortId);
  const description = listing.sold
    ? `Объект продан: ${listing.title}. Архив объявления ROYAL HOME. Актуальные предложения недвижимости в Душанбе смотрите в каталоге.`
    : (listing.metaDescription || listing.seoDesc || seo.metaDescription).trim();
  const images = (listing.imageUrls ?? []).map((u) => absUrl(u, DEFAULT_IMAGE));
  return {
    title,
    description,
    publicListing: projectPublicListing(listing),
    image: images[0] ? ogImageUrl(images[0]) : DEFAULT_IMAGE,
    url,
    type: "product",
    body: contentShell(listing.h1?.trim() || listing.title,
      `${listing.sold ? '<p><strong>Продано. Архив объявления.</strong></p>' : ''}<p>${esc(listing.location)}</p>` +
      `<p>${listing.sold ? 'Цена в архиве' : 'Цена'}: ${esc(listing.price.toLocaleString("ru-RU"))} сомони · ${listing.area} м²</p>` +
      listingFactsHtml(listing) +
      `<p>${esc(listing.description || listing.seoDesc || seo.metaDescription).replace(/\n/g, "<br />")}</p>` +
      contactActionsHtml('ru', listing) +
      (listing.videoUrl && images.length ? `<p><a href="/listing/${listing.id}/video">Видеообзор объекта</a></p>` : '') +
      '<p><a href="/listings">Все объекты недвижимости в Душанбе</a></p>'),
    jsonLd: listingJsonLd({ title: listing.h1?.trim() || listing.title, description, images,
      url, price: listing.price, rooms: listing.rooms, area: listing.area, sold: listing.sold, category: listing.category,
      videoUrl: listing.videoUrl ? listingVideoContentUrl(listing.id) : null, uploadDate: listing.createdAt }),
  };
}

async function headForBlog(id: number, url: string): Promise<Head | null> {
  const posts = (await getCmsEntry("blogPosts")) as
    | Array<{ id: number; title: string; excerpt?: string; content?: string; image?: string; category?: string; active?: boolean }>
    | undefined;
  const post = posts?.find((p) => p.id === id && p.active !== false);
  if (!post) return null;
  const image = absUrl(post.image, DEFAULT_IMAGE);
  return {
    title: `${post.title} | Блог Royal Home`,
    description: post.excerpt || DEFAULT_DESC,
    image: ogImageUrl(image),
    url,
    type: "article",
    body: contentShell(post.title, `<p>${esc(post.excerpt || "")}</p>` + (isFinancialArticle(post.title, post.category) ? `<p>${esc(ARTICLE_FINANCE_NOTE)}</p>` : "") +
      (post.content && post.content.trim().length > 120 ? post.content.split(/\n{2,}|\r\n{2,}/).map((paragraph) =>
        paragraph.startsWith("## ") ? `<h3>${esc(paragraph.slice(3))}</h3>` : `<p>${esc(paragraph).replace(/\n/g, "<br />")}</p>`
      ).join("") : "") + '<p><a href="/blog">Все статьи</a></p>'),
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: post.title,
      description: post.excerpt,
      image,
      articleSection: post.category,
      url,
      mainEntityOfPage: url,
      publisher: { "@type": "Organization", name: "ROYAL HOME", "@id": `${SITE_ORIGIN}/#organization` },
    },
  };
}

/** Статья из таблицы articles (ИИ-генератор) — URL по слагу /blog/:slug. */
async function headForArticle(slug: string, url: string): Promise<Head | null> {
  const article = await findPublishedArticleBySlug(slug);
  if (!article) return null;
  const image = absUrl(article.coverImageUrl, DEFAULT_IMAGE);
  const description = (article.metaDescription || article.excerpt || DEFAULT_DESC).trim();
  const credit = articleCoverCredit(article.id, article.coverImageUrl);
  const mediaDisclosure = historicalArticleMediaDisclosure({ id: article.id, coverImageUrl: article.coverImageUrl, sourceHash: translationSourceHash(article) });
  const jsonLd: object[] = [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: article.title,
      description,
      image,
      url,
      mainEntityOfPage: url,
      datePublished: article.publishedAt?.toISOString(),
      dateModified: article.updatedAt?.toISOString(),
      publisher: { "@type": "Organization", name: "ROYAL HOME", "@id": `${SITE_ORIGIN}/#organization` },
    },
  ];
  if (article.faq?.length) {
    jsonLd.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: article.faq.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    });
  }
  return {
    title: article.metaTitle?.trim() || `${article.title} | Блог Royal Home`,
    description,
    image: ogImageUrl(image),
    url,
    type: "article",
    body: contentShell(article.title, (mediaDisclosure?.cover ? `<p>${esc(HISTORICAL_COVER_NOTE)}</p>` : "") + (credit ? `<p>Фото объекта из каталога · <a href="/listing/${credit.listingId}">Смотреть объект →</a></p>` : "") + (article.excerpt ? `<p>${esc(article.excerpt)}</p>` : "") + (isFinancialArticle(article.title, article.category) ? `<p>${esc(ARTICLE_FINANCE_NOTE)}</p>` : "") + (mediaDisclosure?.body ? `<p>${esc(HISTORICAL_BODY_IMAGES_NOTE)}</p>` : "") + sanitizeArticleHtml(article.contentHtml) + '<p><a href="/blog">Все статьи</a></p>'),
    jsonLd,
  };
}

/** Определяет SEO-голову для запрошенного пути. Никогда не бросает. */
async function russianHeadForPath(requestPath: string): Promise<Head> {
  const requestUrl = new URL(requestPath, SITE_ORIGIN);
  const pathname = requestUrl.pathname;
  const url = `${SITE_ORIGIN}${pathname}`;
  const fallback: Head = {
    title: DEFAULT_TITLE,
    description: DEFAULT_DESC,
    image: DEFAULT_IMAGE,
    url,
    type: "website",
  };
  // Несуществующая сущность/страница: HTML отдаём (SPA покажет свою заглушку),
  // но со статусом 404 и noindex — иначе поисковик индексирует бесконечные
  // «пустые» URL с дефолтными мета (классический soft-404).
  const notFound: Head = { ...fallback, title: "Страница не найдена — ROYAL HOME", noindex: true, status: 404,
    body: contentShell("Страница не найдена", '<p>Объект или страница недоступны. <a href="/listings">Перейти в каталог</a></p>') };
  try {
    const listingMatch = pathname.match(/^\/listing\/(\d+)$/);
    if (listingMatch) return (await headForListing(Number(listingMatch[1]), url)) ?? notFound;

    const district = districtFromPath(pathname);
    if (district) {
      const inventory = (await findAllListings()).map(projectPublicListing);
      const page = districtPageData(inventory, district, 'ru');
      return { ...fallback, title: page.copy.title, description: page.copy.description,
        noindex: !page.rows.length || catalogNeedsNoindex(requestUrl.searchParams),
        catalogInventory: inventory, jsonLd: page.jsonLd, body: contentShell(page.copy.heading, page.body) };
    }

    const blogMatch = pathname.match(/^\/blog\/(\d+)$/);
    if (blogMatch) return (await headForBlog(Number(blogMatch[1]), url)) ?? notFound;

    // Не-числовой сегмент после /blog/ — slug статьи из таблицы articles.
    const articleMatch = pathname.match(/^\/blog\/([a-z0-9][a-z0-9-]*)$/);
    if (articleMatch) return (await headForArticle(articleMatch[1], url)) ?? notFound;

    // Персональные/технические страницы из индексации исключаем.
    // Админка/логин/превью — SPA-маршруты: HTML отдаём, но в индекс не пускаем.
    if (pathname === "/admin" || pathname.startsWith("/admin/") || pathname === "/login" || pathname.startsWith("/listing/preview/")) {
      return { ...fallback, noindex: true };
    }
    // Детальные страницы услуг. Слаг сверяется со справочником: несуществующая
    // услуга — это 404 и noindex, как для объекта и статьи. Раньше сюда подходил
    // ЛЮБОЙ слаг и отдавался со статусом 200 и открытым для индексации (soft-404:
    // сервер обещает страницу, человек видит «Услуга не найдена»), а все семь
    // страниц услуг делили один заголовок и описание — поисковик считал их дублями.
    const serviceMatch = pathname.match(/^\/services\/([a-z0-9-]+)$/);
    if (serviceMatch) {
      const service = findServiceSeo(serviceMatch[1]);
      if (!service) return notFound;
      return { ...fallback, title: service.metaTitle, description: service.metaDesc, url,
        body: contentShell(`${service.title} в Душанбе`, `<p>${esc(service.metaDesc)}</p><p><a href="/contacts">Связаться с агентством</a></p>`) };
    }

    let staticPage = STATIC_PAGES[pathname];
    if (staticPage) {
      const cmsPageKey: Record<string, string> = { "/": "home", "/listings": "listings", "/services": "services", "/about": "about", "/contacts": "contacts", "/blog": "blog" };
      const pageKey = cmsPageKey[pathname];
      const site = await getCmsEntry("site") as SiteSeoSettings | undefined;
      if (pageKey) {
        const configured = site?.pageSeo?.[pageKey];
        staticPage = {
          title: typeof configured?.title === "string" && configured.title.trim() ? configured.title.trim() : staticPage.title,
          description: typeof configured?.description === "string" && configured.description.trim() ? configured.description.trim() : staticPage.description,
        };
      }
      staticPage = { ...staticPage, title: normalizeCompanyContactText(staticPage.title.replace(/Royal Home(?: TJ)?/gi, "ROYAL HOME")), description: normalizeCompanyContactText(staticPage.description) };
      const jsonLd = pathname === "/mortgage" ? MORTGAGE_FAQ : undefined;
      if (pathname === "/") {
        const [hero, inventory] = await Promise.all([
          getCmsEntry("hero") as Promise<{ title?: string; titleHighlight?: string; subtitle?: string } | undefined>,
          findAllListings(),
        ]);
        const heading = `${hero?.title ?? "НАЙДИТЕ СВОЙ"} ${hero?.titleHighlight ?? "ИДЕАЛЬНЫЙ ДОМ"}`.trim();
        const intro = hero?.subtitle ?? "Royal Home — надёжное агентство недвижимости в Душанбе. Проверенные квартиры, профессиональные риелторы, полное юридическое сопровождение.";
        const links = inventory.filter((item) => !item.sold).slice(0, 8).map((item) =>
          `<li><a href="/listing/${item.id}">${esc(item.title)}</a> — ${esc(item.location)} · ${esc(item.price.toLocaleString("ru-RU"))} сомони</li>`).join("");
        return { ...fallback, ...staticPage, jsonLd, catalogInventory: inventory.map(projectPublicListing), body: contentShell(heading, `<p>${esc(intro)}</p><p><a href="/listings">Купить</a> · <a href="/sell">Продать</a> · <a href="/services">Услуги</a></p>${districtNavigationHtml('ru')}<ul>${links}</ul>`) };
      }
      if (pathname === "/listings") {
        const inventory = (await findAllListings()).map(projectPublicListing);
        const district = requestUrl.searchParams.get("district");
        const rooms = requestUrl.searchParams.get("rooms");
        const category = requestUrl.searchParams.get("category");
        const tab = requestUrl.searchParams.get("tab");
        const q = requestUrl.searchParams.get("q");
        const filtered = inventory.filter((item) =>
          (!district || district === "Все районы" || item.location.toLowerCase().includes(district.toLowerCase())) &&
          (!rooms || rooms === "Все" || (rooms === "4+" ? item.rooms >= 4 : item.rooms === Number(rooms))) &&
          (!category || category === "all" || item.category === category) &&
          (!tab || tab === "all" || (tab === "new" ? item.type === "Новостройки" : tab === "secondary" ? item.type === "Вторичка" : tab === "urgent" ? item.urgent && !item.sold : true)) &&
          (!q || matchesSearch(`${item.title} ${item.location} ${item.description || ""}`, q))
        );
        return { ...fallback, ...staticPage, noindex: catalogNeedsNoindex(requestUrl.searchParams), preloadImage: catalogCoverPreload(requestPath, inventory), catalogInventory: inventory,
          body: contentShell("Купить квартиру в Душанбе", `<p>${esc(staticPage.description)}</p>${districtNavigationHtml('ru')}<ul>${filtered.map((item) =>
            `<li><a href="/listing/${item.id}">${esc(item.title)}</a> — ${esc(item.location)} · ${item.area} м² · ${esc(item.price.toLocaleString("ru-RU"))} сомони${item.sold ? ' · Продано' : ''}</li>`
          ).join("")}</ul>`) };
      }
      if (pathname === "/blog") {
        const [posts, articles] = await Promise.all([
          getCmsEntry("blogPosts") as Promise<Array<{ id: number; title: string; active?: boolean }> | undefined>,
          findPublishedArticles({ limit: 50, offset: 0 }),
        ]);
        const links = [...(posts ?? []).filter((post) => post.active !== false).map((post) =>
          `<li><a href="/blog/${post.id}">${esc(post.title)}</a></li>`), ...articles.items.map((article) =>
          `<li><a href="/blog/${esc(article.slug)}">${esc(article.title)}</a></li>`)];
        return { ...fallback, ...staticPage, body: contentShell("Блог о недвижимости", `<ul>${links.join("")}</ul>`) };
      }
      const contactText = `<p>${esc(site?.address ?? "г. Душанбе, ул. Бухоро 49, 2 этаж")}</p>${contactActionsHtml()}`;
      let body: string | undefined;
      if (pathname === "/services") {
        body = contentShell((site?.pageSeo?.services?.h1 ?? "Услуги ROYAL HOME").replace(/Royal Home(?: TJ)?/gi, "ROYAL HOME"), `<p>${esc("Покупка, продажа и подготовка жилья в Душанбе. Выберите направление — обсудим вашу задачу и порядок работы.")}</p><ul>${SERVICE_SEO.map((service) => `<li><a href="/services/${service.slug}">${esc(service.title)}</a></li>`).join("")}</ul>`);
      } else if (pathname === "/contacts") {
        body = contentShell("Связь с нами", '<p>Мы всегда на связи и готовы помочь вам с любыми вопросами недвижимости в Душанбе</p>' + contactText +
          `<p>${esc(site?.email ?? "info@royalhome.tj")}</p><p>${esc(site?.workHours ?? COMPANY_HOURS.display)}</p>`);
      } else if (pathname === "/about") {
        body = contentShell("ROYAL HOME", '<p>Надёжное агентство недвижимости в Душанбе. Помогаем найти идеальный дом — честно и под ключ.</p>' + contactText);
      } else if (pathname === "/mortgage") {
        body = contentShell("Ипотека в Таджикистане", `<p>${esc(staticPage.description)}</p><p><a href="/services/mortgage">Оформление ипотеки</a> · <a href="/contacts">Контакты</a></p>`);
      } else if (pathname === "/sell") {
        body = contentShell("Продать квартиру", `<p>${esc(staticPage.description)}</p>${sellGuideHtml('ru')}`);
      } else if (pathname === "/privacy") {
        body = contentShell("Политика конфиденциальности", `<p>${esc(staticPage.description)}</p><p><a href="/contacts">Контакты агентства</a></p>`);
      } else if (pathname === "/favorites") {
        body = contentShell("Избранное", `<p>${esc(staticPage.description)}</p><p><a href="/listings">Перейти в каталог</a></p>`);
      }
      return { ...fallback, title: staticPage.title, description: staticPage.description, url, jsonLd, body, noindex: pathname === "/favorites" };
    }

    // Путь не известен ни как сущность, ни как статическая страница → 404.
    return notFound;
  } catch (err) {
    console.error(`[prerenderSeo] Не удалось построить SEO для ${pathname}:`, err);
    return { ...fallback, status: 503 };
  }
}

export async function headForPath(requestPath: string): Promise<Head> {
  const request = new URL(requestPath, SITE_ORIGIN);
  const identity = resolvePublicPath(request.pathname);
  const watch = /^\/listing\/([1-9]\d*)\/video$/.exec(identity.basePath);
  if (watch) {
    const fallback = { title: VIDEO_COPY[identity.locale].missing, description: VIDEO_COPY[identity.locale].missing,
      image: DEFAULT_IMAGE, url: `${SITE_ORIGIN}${identity.canonicalPath}`, type: 'website' as const,
      language: identity.locale, noindex: true, body: `<main><h1>${VIDEO_COPY[identity.locale].missing}</h1><a href="/listings">ROYAL HOME</a></main>` };
    try { return await videoWatchHead(Number(watch[1]), identity.locale) ?? { ...fallback, status: 404 }; }
    catch { return { ...fallback, status: 503 }; }
  }
  const original = await russianHeadForPath(identity.basePath + request.search);
  try {
    // Hono supplies an absolute request URL; locale identity accepts a pathname.
    return await localizeHead(request.pathname + request.search, original);
  } catch (error) {
    console.error('[prerenderSeo] Locale publication unavailable:', error);
    return { ...original, language: identity.locale, url: `${SITE_ORIGIN}${identity.canonicalPath}`, noindex: true,
      status: 503, alternates: [], jsonLd: undefined, body: '<main><h1>ROYAL HOME</h1></main>' };
  }
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function contentShell(title: string, content: string): string {
  return `<main class="mx-auto max-w-5xl px-6 py-12"><nav aria-label="Навигация"><a href="/">ROYAL HOME</a> · <a href="/listings">Каталог</a> · <a href="/contacts">Контакты</a></nav><h1 class="text-3xl font-bold my-6">${esc(title)}</h1><div class="space-y-4">${content}</div></main>`;
}

function setMetaContent(html: string, attr: "name" | "property", key: string, value: string): string {
  const re = new RegExp(`(<meta ${attr}="${key}" content=")[^"]*(")`, "i");
  if (re.test(html)) return html.replace(re, (_match, prefix: string, suffix: string) => `${prefix}${esc(value)}${suffix}`);
  // Тега нет в шаблоне — добавляем перед </head>.
  return html.replace("</head>", () => `    <meta ${attr}="${key}" content="${esc(value)}" />\n  </head>`);
}

/** Подставляет SEO-голову в строку index.html. */
export function injectSeo(html: string, head: Head): string {
  let out = html;
  out = out.replace(/<html\b([^>]*)>/i, (_match, attrs: string) => `<html${attrs.replace(/\s+lang\s*=\s*["'][^"']*["']/i, '')} lang="${head.language ?? 'ru'}">`);
  out = out.replace(/\s*<link\b[^>]*rel=["']alternate["'][^>]*hreflang=["'][^"']*["'][^>]*>/gi, '');
  if (!head.noindex && (head.status ?? 200) === 200) for (const alternate of head.alternates ?? []) {
    out = out.replace('</head>', () => `<link rel="alternate" hreflang="${alternate.language}" href="${SITE_ORIGIN}${esc(alternate.path)}" />\n</head>`);
  }
  const defaultLanguage = head.alternates?.find(alternate => alternate.language === 'ru');
  if (!head.noindex && (head.status ?? 200) === 200 && defaultLanguage) {
    out = out.replace('</head>', () => `<link rel="alternate" hreflang="x-default" href="${SITE_ORIGIN}${esc(defaultLanguage.path)}" />\n</head>`);
  }
  const title = head.title.replace(/Royal Home(?: TJ)?/gi, "ROYAL HOME");
  if (head.preloadImage && (head.status ?? 200) === 200) {
    out = out.replace(/<head\b[^>]*>/i, tag => `${tag}\n<link rel="preload" as="image" href="${esc(head.preloadImage!)}" fetchpriority="high" />`);
  }

  out = out.replace(/<title>[\s\S]*?<\/title>/i, () => `<title>${esc(title)}</title>`);
  out = setMetaContent(out, "name", "description", head.description);
  out = setMetaContent(out, "name", "robots", head.noindex ? "noindex, follow" : "index, follow, max-image-preview:large, max-video-preview:-1, max-snippet:-1");
  out = setMetaContent(out, "name", "language", head.language === 'tg' ? 'Tajik' : head.language === 'en' ? 'English' : 'Russian');

  out = setMetaContent(out, "property", "og:title", title);
  out = setMetaContent(out, "property", "og:site_name", "ROYAL HOME");
  out = setMetaContent(out, "property", "og:description", head.description);
  out = setMetaContent(out, "property", "og:type", head.type);
  out = setMetaContent(out, "property", "og:url", head.url);
  out = setMetaContent(out, "property", "og:image", head.image);
  out = setMetaContent(out, "property", "og:locale", head.language === 'tg' ? 'tg_TJ' : head.language === 'en' ? 'en_US' : 'ru_TJ');

  out = setMetaContent(out, "name", "twitter:title", title);
  out = setMetaContent(out, "name", "twitter:description", head.description);
  out = setMetaContent(out, "name", "twitter:image", head.image);

  if (head.status === 404) {
    // 404-страница: canonical на несуществующий URL — противоречие (canonical
    // объявляет страницу «настоящей», noindex рядом говорит обратное; Google
    // такие сигналы считает конфликтом). Тег убираем целиком, noindex выше остаётся.
    out = out.replace(/[ \t]*<link rel="canonical"[^>]*\/?>\s*\r?\n?/i, "");
  } else {
    out = out.replace(/(<link rel="canonical" href=")[^"]*(")/i, (_match, prefix: string, suffix: string) => `${prefix}${esc(head.url)}${suffix}`);
  }

  if (head.jsonLd) {
    // < вместо '<' — иначе строка "</script>" внутри данных (заголовок статьи,
    // FAQ) вырвалась бы из ld+json-блока и стала бы XSS в пререндеренной странице.
    const jsonLd = JSON.stringify(head.jsonLd).replace(/</g, "\\u003c");
    const script = `<script type="application/ld+json" id="seo-page-jsonld">${jsonLd}</script>`;
    out = out.replace("</head>", () => `    ${script}\n  </head>`);
  }

  if (head.body) out = out.replace(/<div id="root"><\/div>/, () => {
    const root = `<div id="root"${head.hydrate ? ' data-public-ssr="true"' : ''}>${head.body}</div>`;
    // Cloudflare's email decoder otherwise rewrites public mailto/text nodes
    // before hydration. Keep this exact React fragment stable through the CDN.
    return head.hydrate ? `<!--email_off-->${root}<!--/email_off-->` : root;
  });

  const bootstrapPath = resolvePublicPath(new URL(head.url, SITE_ORIGIN).pathname).basePath;
  if (head.catalogInventory && (head.status ?? 200) === 200 && (bootstrapPath === '/' || isInventoryPage(bootstrapPath))) {
    const source = serializeCatalogBootstrap(head.catalogInventory);
    if (source) out = out.replace('</body>', () => `<script type="application/json" id="${CATALOG_BOOTSTRAP_ID}">${source}</script>\n</body>`);
  }
  if (head.publicListing && (head.status ?? 200) === 200) {
    const source = serializeListingBootstrap(head.publicListing);
    if (source) out = out.replace('</body>', () => `<script type="application/json" id="${LISTING_BOOTSTRAP_ID}">${source}</script>\n</body>`);
  }

  return normalizeCompanyContactText(out);
}
