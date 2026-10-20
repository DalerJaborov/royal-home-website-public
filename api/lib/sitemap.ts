/**
 * Генератор sitemap.xml (роут в api/boot.ts). Раньше карты сайта не было вовсе —
 * поисковики узнавали о страницах только по ссылкам. Собираем: статические страницы,
 * опубликованные объекты (/listing/:id), активные cms-статьи блога (/blog/:id)
 * и опубликованные статьи из таблицы articles (/blog/:slug).
 */
import { findAllListings } from "../queries/listings";
import { getCmsEntry } from "../queries/cms";
import { findPublishedArticles } from "../queries/articles";
import { SERVICE_SEO } from "@contracts/services-seo";
import { localizedPath, publishedAlternates, type PublicLocale } from '@contracts/public-i18n';
import { completedLocalePages, getPublicArticleTranslation, getPublicDictionary } from './public-translations';
import { legacyArticleTranslated, type LegacyArticleSource } from '@contracts/legacy-article-i18n';
import { DISTRICT_PAGES, districtListings } from '@contracts/district-catalog';

const SITE_ORIGIN = "https://royalhome.tj";

// /privacy тут не для галочки: на неё ведёт ссылка из подвала каждой страницы и
// её SEO описано в prerenderSeo, а в карте сайта её не было.
const STATIC_PATHS = [
  "/",
  "/listings",
  "/services",
  "/mortgage",
  "/sell",
  "/about",
  "/contacts",
  "/blog",
  "/privacy",
];

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function urlTag(path: string, lastmod?: Date | null, alternates: ReturnType<typeof publishedAlternates> = []): string {
  const lm = lastmod ? `<lastmod>${lastmod.toISOString().slice(0, 10)}</lastmod>` : "";
  return `<url><loc>${esc(SITE_ORIGIN + path)}</loc>${lm}${alternates.map(alternate => `<xhtml:link rel="alternate" hreflang="${alternate.language}" href="${esc(SITE_ORIGIN + alternate.path)}" />`).join('')}</url>`;
}

export async function buildSitemapXml(): Promise<string> {
  const completed = await completedLocalePages();
  const urls: string[] = [];
  const append = (basePath: string, lastmod?: Date | null, available?: PublicLocale[]) => {
    const gates = available ? {
      tg: available.includes('tg') ? [basePath] : [], en: available.includes('en') ? [basePath] : [],
    } : completed;
    const alternates = publishedAlternates(basePath, gates);
    urls.push(urlTag(basePath, lastmod, alternates));
    for (const alternate of alternates) if (alternate.language !== 'ru') urls.push(urlTag(localizedPath(basePath, alternate.language), lastmod, alternates));
  };
  STATIC_PATHS.forEach(path => append(path));

  // Страницы услуг — шесть отдельных адресов с собственными title и описанием
  // (см. contracts/services-seo.ts). В карте сайта их не было вовсе: поисковик
  // мог узнать о них только по ссылкам с главной.
  for (const s of SERVICE_SEO) {
    append(`/services/${s.slug}`);
  }

  // An outage must produce a retryable HTTP error, not a successful sitemap
  // that silently drops the catalog or blog. The route owns the 503 response.
  const [listings, rawPosts] = await Promise.all([findAllListings(), getCmsEntry("blogPosts")]);
  for (const listing of listings) append(`/listing/${listing.id}`, listing.updatedAt);
  for (const district of DISTRICT_PAGES) {
    const rows = districtListings<(typeof listings)[number]>(listings, district);
    if (rows.length) append(`/kvartiry/${district.slug}`, new Date(Math.max(...rows.map(row => row.updatedAt.getTime()))));
  }

  const [tgDictionary, enDictionary] = await Promise.all([getPublicDictionary('tg'), getPublicDictionary('en')]);
  const posts = rawPosts as LegacyArticleSource[] | undefined;
  for (const post of posts ?? []) {
    if (post.active !== false) {
      const available: PublicLocale[] = ['ru'];
      if (tgDictionary && completed.tg.includes(`/blog/${post.id}`) && legacyArticleTranslated(post, tgDictionary.strings)) available.push('tg');
      if (enDictionary && completed.en.includes(`/blog/${post.id}`) && legacyArticleTranslated(post, enDictionary.strings)) available.push('en');
      append(`/blog/${post.id}`, undefined, available);
    }
  }

  // Fetch every published article, including older pages beyond the first 500.
  for (let offset = 0; ; offset += 500) {
    const { items, total } = await findPublishedArticles({ limit: 500, offset });
    for (const article of items) {
      const lastmod = article.publishedAt && article.publishedAt > article.updatedAt
        ? article.publishedAt : article.updatedAt;
      const available: PublicLocale[] = ['ru'];
      for (const locale of ['tg', 'en'] as const) if (completed[locale].includes('/blog') && await getPublicArticleTranslation(locale, article)) available.push(locale);
      append(`/blog/${article.slug}`, lastmod, available);
    }
    if (items.length === 0 || offset + items.length >= total) break;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join("\n")}\n</urlset>\n`;
}
