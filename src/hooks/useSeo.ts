import { useEffect } from 'react';
import { catalogNeedsNoindex } from '@contracts/catalog-seo';
import { resolvePublicPath, localizedPath, publishedAlternates, isPublicPageComplete, localizedStructuredData, type PublicLocale, type LocaleAlternate } from '@contracts/public-i18n';
import localeCoverage from '@contracts/public-locale-coverage.json';
import { useLocale } from '@/hooks/useLocale';

/**
 * Единый источник SEO для страниц. Сайт — клиентский SPA, поэтому теги, зашитые
 * в index.html, статичны (значения главной). Этот хук на каждом маршруте ПОЛНОСТЬЮ
 * перезаписывает title/description/og/twitter/canonical и подставляет per-page
 * JSON-LD, так что каждая страница отдаёт свой уникальный SEO поисковику и своё
 * превью в мессенджерах. Каждая публичная страница обязана вызвать useSeo —
 * тогда при переходе не остаётся «хвостов» от предыдущей страницы.
 *
 * Важно: og-теги, вставленные через JS, видят краулеры, исполняющие JS (Google),
 * но НЕ видят простые скрейперы превью-ссылок (Telegram/WhatsApp/Facebook). Для
 * них нужен пререндер (фаза 3) — этот хук закрывает поисковый SEO и Google.
 */

export const SITE_ORIGIN = 'https://royalhome.tj';
const DEFAULT_TITLE = 'Купить квартиру в Душанбе | ROYAL HOME — Недвижимость';
const DEFAULT_DESC =
  'ROYAL HOME — агентство недвижимости в Душанбе. Квартиры с фото и ценами, контакты риелторов и сопровождение сделок.';
const DEFAULT_IMAGE = `${SITE_ORIGIN}/og-image.jpg`;
const completedCoverage: Partial<Record<PublicLocale, readonly string[]>> = localeCoverage;

export interface SeoOptions {
  /** <title> и og/twitter title. */
  title: string;
  /** meta description + og/twitter description. По умолчанию — описание сайта. */
  description?: string;
  /** Картинка для og/twitter (абсолютная или /относительная). По умолчанию og-image сайта. */
  image?: string;
  /** Путь для canonical/og:url. По умолчанию — текущий pathname. */
  path?: string;
  /** og:type. */
  type?: 'website' | 'article' | 'product';
  /** Доп. JSON-LD страницы — вставляется отдельным <script>, заменяя предыдущий. */
  jsonLd?: object | object[] | null;
  /** true → просим краулеры не индексировать (админка/превью). */
  noindex?: boolean;
  /** Keep server metadata while asynchronous page data is still loading. */
  pending?: boolean;
  language?: PublicLocale;
  alternates?: LocaleAlternate[];
  /** Verified runtime article publication; new articles need no build to gain their real language pages. */
  availableLocales?: PublicLocale[];
}

function upsertMeta(attr: 'name' | 'property', key: string, content: string) {
  let tag = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute(attr, key);
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', content);
}

function upsertCanonical(href: string) {
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!link) {
    link = document.createElement('link');
    link.setAttribute('rel', 'canonical');
    document.head.appendChild(link);
  }
  link.setAttribute('href', href);
}

function toAbsolute(url: string | undefined, fallback: string): string {
  if (!url) return fallback;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `${SITE_ORIGIN}${url.startsWith('/') ? '' : '/'}${url}`;
}

export function useSeo(opts: SeoOptions) {
  const localeState = useLocale();
  const { title, description, image, path, type = 'website', jsonLd, noindex, pending, language, alternates, availableLocales } = opts;
  const locale = language ?? localeState.locale;
  const identity = resolvePublicPath(path ?? localeState.basePath);
  const canonicalPath = localizedPath(identity.basePath, locale);
  // Mutable article/property metadata comes from its current source/resource,
  // rather than an old build-time copy attached to an existing ID or slug.
  const entityPath = /^\/(?:listing\/[1-9]\d*(?:\/video)?|blog\/[^/]+)$/.test(identity.basePath);
  const translatedPage = entityPath ? undefined : localeState.dictionary.pages?.[identity.basePath];
  const translatedTitle = locale === 'ru' ? title : translatedPage?.title ?? localeState.text(title);
  const translatedDescription = locale === 'ru' ? description : translatedPage?.description ?? (description ? localeState.text(description) : undefined);
  const dynamicArticle = /^\/blog\/[a-z0-9][a-z0-9-]*$/.test(identity.basePath);
  const translationComplete = locale === 'ru' || (dynamicArticle && availableLocales ? availableLocales.includes(locale) : isPublicPageComplete(identity.basePath, completedCoverage[locale]));
  const publication = dynamicArticle && availableLocales ? { tg: availableLocales.includes('tg') ? [identity.basePath] : [], en: availableLocales.includes('en') ? [identity.basePath] : [] } : completedCoverage;
  const alternateText = JSON.stringify(alternates ?? publishedAlternates(identity.basePath, publication, noindex || !translationComplete));
  const jsonLdText = jsonLd ? JSON.stringify(localizedStructuredData(jsonLd, locale, localeState.dictionary.strings)) : '';
  useEffect(() => {
    document.documentElement.lang = locale;
    if (pending || (locale !== 'ru' && localeState.loading)) return;
    const desc = translatedDescription?.trim() || (locale === 'ru' ? DEFAULT_DESC : 'ROYAL HOME');
    const img = toAbsolute(image, DEFAULT_IMAGE);
    const url = `${SITE_ORIGIN}${canonicalPath}`;

    const brandedTitle = (translatedTitle || DEFAULT_TITLE).replace(/Royal Home(?: TJ)?/gi, 'ROYAL HOME');
    document.title = brandedTitle;
    upsertMeta('name', 'description', desc);
    const catalogFiltered = identity.basePath === '/listings' && catalogNeedsNoindex(new URLSearchParams(window.location.search));
    const blocked = noindex || catalogFiltered || !translationComplete;
    upsertMeta('name', 'robots', blocked ? 'noindex, follow' : 'index, follow, max-image-preview:large, max-video-preview:-1, max-snippet:-1');
    upsertMeta('name', 'language', locale === 'tg' ? 'Tajik' : locale === 'en' ? 'English' : 'Russian');

    upsertMeta('property', 'og:title', brandedTitle);
    upsertMeta('property', 'og:site_name', 'ROYAL HOME');
    upsertMeta('property', 'og:description', desc);
    upsertMeta('property', 'og:type', type);
    upsertMeta('property', 'og:url', url);
    upsertMeta('property', 'og:image', img);
    upsertMeta('property', 'og:locale', locale === 'tg' ? 'tg_TJ' : locale === 'en' ? 'en_US' : 'ru_TJ');

    upsertMeta('name', 'twitter:title', brandedTitle);
    upsertMeta('name', 'twitter:description', desc);
    upsertMeta('name', 'twitter:image', img);

    upsertCanonical(url);
    document.head.querySelectorAll('link[rel="alternate"][hreflang]').forEach(link => link.remove());
    if (!blocked) for (const alternate of JSON.parse(alternateText) as LocaleAlternate[]) {
      const link = document.createElement('link');
      link.rel = 'alternate';
      link.hreflang = alternate.language;
      link.href = `${SITE_ORIGIN}${alternate.path}`;
      document.head.appendChild(link);
    }
    const defaultLanguage = (JSON.parse(alternateText) as LocaleAlternate[]).find(alternate => alternate.language === 'ru');
    if (!blocked && defaultLanguage) {
      const link = document.createElement('link');
      link.rel = 'alternate'; link.hreflang = 'x-default';
      link.href = `${SITE_ORIGIN}${defaultLanguage.path}`;
      document.head.appendChild(link);
    }

    // Per-page JSON-LD живёт отдельным скриптом — глобальный @graph
    // (организация/сайт) из index.html не трогаем.
    document.getElementById('seo-page-jsonld')?.remove();
    if (jsonLdText) {
      const script = document.createElement('script');
      script.type = 'application/ld+json';
      script.id = 'seo-page-jsonld';
      script.textContent = jsonLdText;
      document.head.appendChild(script);
    }
  }, [translatedTitle, translatedDescription, image, canonicalPath, identity.basePath, type, noindex, pending, jsonLdText, locale, localeState.loading, translationComplete, alternateText]);
}
