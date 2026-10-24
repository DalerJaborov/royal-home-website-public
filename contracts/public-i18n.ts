/** URL identity is shared by the SPA and server. Russian URLs stay unchanged. */
export type PublicLocale = 'ru' | 'tg' | 'en';
export const PUBLIC_LOCALES: readonly PublicLocale[] = ['ru', 'tg', 'en'];
const TG_ALIASES: Record<string, string> = {
  '/': '/tg', '/listings': '/tg/khonaho-dushanbe', '/contacts': '/tg/tamos',
};

function splitPath(value: string) {
  const cut = value.search(/[?#]/);
  return { pathname: cut < 0 ? value : value.slice(0, cut), suffix: cut < 0 ? '' : value.slice(cut) };
}
function privatePath(path: string) {
  return /^\/(?:admin(?:\/|$)|login(?:\/|$)|api(?:\/|$)|listing\/preview(?:\/|$))/.test(path);
}

export function resolvePublicPath(value: string): { locale: PublicLocale; basePath: string; canonicalPath: string; pageKey: string } {
  const { pathname } = splitPath(value);
  let locale: PublicLocale = 'ru';
  let basePath = pathname || '/';
  const prefix = /^\/(tg|en)(?:\/|$)/.exec(basePath);
  if (prefix) {
    locale = prefix[1] as PublicLocale;
    basePath = basePath.slice(prefix[0].length - (prefix[0].endsWith('/') ? 1 : 0)) || '/';
    if (locale === 'tg') {
      if (basePath === '/khonaho-dushanbe') basePath = '/listings';
      else if (basePath === '/tamos') basePath = '/contacts';
      else basePath = basePath.replace(/^\/khona\/([1-9]\d*)(\/video)?$/, '/listing/$1$2');
    }
  }
  // Protected interfaces never acquire a public-language URL.
  if (privatePath(basePath)) locale = 'ru';
  const canonicalPath = locale === 'ru' ? basePath : locale === 'tg'
    ? TG_ALIASES[basePath] ?? basePath.replace(/^\/listing\/([1-9]\d*)(\/video)?$/, '/khona/$1$2').replace(/^/, '/tg')
    : `/en${basePath === '/' ? '' : basePath}`;
  return { locale, basePath, canonicalPath, pageKey: basePath };
}

/** Query/filter enum values and hash fragments are preserved byte-for-byte. */
export function localizedPath(value: string, locale: PublicLocale): string {
  if (!value.startsWith('/') || value.startsWith('//')) return value;
  const { suffix } = splitPath(value);
  const identity = resolvePublicPath(value);
  if (privatePath(identity.basePath)) return `${identity.basePath}${suffix}`;
  const base = identity.basePath;
  const path = locale === 'ru' ? base : locale === 'tg'
    ? TG_ALIASES[base] ?? `/tg${base.replace(/^\/listing\/([1-9]\d*)(\/video)?$/, '/khona/$1$2')}`
    : `/en${base === '/' ? '' : base}`;
  return path + suffix;
}

export interface PublishedPageTranslation { title: string; description: string; h1?: string; intro?: string }
export interface PublicLocaleDictionary {
  strings: Record<string, string>;
  cms?: Record<string, unknown>;
  pages?: Record<string, PublishedPageTranslation>;
  /** Explicit publication gate. A dictionary existing alone does not publish every URL. */
  completedPages?: string[];
}
export interface LocaleAlternate { language: PublicLocale; path: string }
export function isPublicPageComplete(basePath: string, completed: readonly string[] | undefined): boolean {
  if (/^\/listing\/[1-9]\d*\/video$/.test(basePath)) return isPublicPageComplete(basePath.slice(0, -6), completed);
  return !!completed && (completed.includes(basePath) || (/^\/listing\/[1-9]\d*$/.test(basePath) && completed.includes('/listing/:id')));
}
export interface ArticleTranslationSource {
  id: number; slug?: string; title: string; excerpt?: string | null; contentHtml: string;
  metaTitle?: string | null; metaDescription?: string | null; faq?: Array<{ q: string; a: string }> | null;
}
export interface PublishedArticleTranslation {
  sourceHash: string; title: string; excerpt: string; contentHtml: string;
  metaTitle: string; metaDescription: string; faq: Array<{ q: string; a: string }>;
}
/** SHA-256 UTF-8 of this exact ordered JSON is the publication revision. */
export function articleTranslationSource(source: ArticleTranslationSource): string {
  return JSON.stringify({ id: source.id, slug: source.slug ?? '', title: source.title,
    excerpt: source.excerpt ?? '', contentHtml: source.contentHtml,
    metaTitle: source.metaTitle ?? '', metaDescription: source.metaDescription ?? '',
    faq: (source.faq ?? []).map(({ q, a }) => ({ q, a })) });
}
export function articleTranslationPath(locale: PublicLocale, id: number): string {
  return `/locales/${locale}/articles/${id}.json`;
}
export function publishedAlternates(basePath: string, completed: Partial<Record<PublicLocale, readonly string[]>>, noindex = false): LocaleAlternate[] {
  if (noindex) return [];
  const languages = PUBLIC_LOCALES.filter(locale => locale === 'ru' || isPublicPageComplete(basePath, completed[locale]));
  return languages.length < 2 ? [] : languages.map(language => ({ language, path: localizedPath(basePath, language) }));
}

/** Translate declared human-readable schema fields, preserving schema enums and IDs. */
export function localizedStructuredData(value: unknown, locale: PublicLocale, strings: Record<string, string>): unknown {
  if (locale === 'ru') return value;
  const textFields = new Set(['name', 'headline', 'description', 'text', 'articleSection']);
  const urlFields = new Set(['url', 'mainEntityOfPage', 'item']);
  const visit = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(visit);
    if (!item || typeof item !== 'object') return item;
    const object = Object.fromEntries(Object.entries(item).map(([key, source]) => {
      if (typeof source === 'string' && textFields.has(key)) return [key, strings[source] ?? source];
      if (typeof source === 'string' && urlFields.has(key) && source.startsWith('https://royalhome.tj')) {
        const url = new URL(source);
        if (url.origin === 'https://royalhome.tj') return [key, url.origin + localizedPath(url.pathname + url.search + url.hash, locale)];
      }
      return [key, visit(source)];
    }));
    if (['Article', 'FAQPage', 'WebPage', 'RealEstateListing'].includes(String(object['@type']))) object.inLanguage = locale;
    return object;
  };
  return visit(value);
}
