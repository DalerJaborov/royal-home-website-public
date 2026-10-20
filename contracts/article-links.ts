import { isPublicPageComplete, localizedPath, resolvePublicPath, type PublicLocale } from './public-i18n';

const staticPages = new Set(['/', '/listings', '/contacts', '/services', '/about', '/privacy', '/blog', '/mortgage', '/sell', '/favorites']);
const servicePage = /^\/services\/(?:buyout|mortgage|repair|design|cleaning|advertising)$/;
const articlePage = /^\/blog\/[a-z0-9][a-z0-9-]*$/;
const anchorTag = /<a\b(?:[^"'<>]|"[^"]*"|'[^']*')*>/gi;
const attributes = /(\s+)([\w:-]+)(\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
const escapeAttribute = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function decodeAttribute(value: string): string {
  return value.replace(/&(?:amp|quot|apos|lt|gt|#\d+|#x[\da-f]+);/gi, entity => {
    const named: Record<string, string> = { '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>' };
    const known = named[entity.toLowerCase()];
    if (known) return known;
    const code = Number.parseInt(entity.slice(entity[2].toLowerCase() === 'x' ? 3 : 2, -1), entity[2].toLowerCase() === 'x' ? 16 : 10);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
  });
}

function anchorHref(tag: string): string | undefined {
  for (const match of tag.matchAll(attributes)) {
    if (match[2].toLowerCase() === 'href') return decodeAttribute(match[4] ?? match[5] ?? match[6] ?? '');
  }
}

function listingId(href: string | undefined): number | undefined {
  if (!href || /[\s\\]/.test(href) || [...href].some(character => character.charCodeAt(0) < 32)) return;
  let path = href;
  if (href.startsWith('https://')) {
    try {
      const url = new URL(href);
      if (url.origin !== 'https://royalhome.tj') return;
      path = url.pathname + url.search + url.hash;
    } catch { return; }
  }
  if (!path.startsWith('/') || path.startsWith('//')) return;
  const value = /^\/listing\/([1-9]\d*)$/.exec(resolvePublicPath(path).basePath)?.[1];
  const id = value ? Number(value) : 0;
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
}

/** Bounded discovery: exceeding 100 unique IDs rejects the input, never returns a partial set. */
export function referencedArticleListingIds(html: string): number[] {
  const ids = new Set<number>();
  for (const match of html.matchAll(anchorTag)) {
    const id = listingId(anchorHref(match[0]));
    if (id !== undefined) ids.add(id);
    if (ids.size > 100) throw new RangeError('Too many property references');
  }
  return [...ids];
}

export interface ArticleLinkAvailability {
  unavailableListingIds?: readonly number[];
  unavailable: string;
  catalog: string;
}

/** Render-only change for already sanitized HTML. Source hashes and content stay intact. */
export function localizeArticleLinks(html: string, locale: PublicLocale, completedPages: readonly string[] | undefined, availability?: ArticleLinkAvailability): string {
  const unavailableIds = new Set(availability?.unavailableListingIds ?? []);
  const catalogPath = localizedPath('/listings', locale === 'ru' || isPublicPageComplete('/listings', completedPages) ? locale : 'ru');
  const visibleHtml = unavailableIds.size ? html.replace(/(<a\b(?:[^"'<>]|"[^"]*"|'[^']*')*>)([\s\S]*?)<\/a\s*>/gi, (anchor, tag: string, body: string) => {
    const id = listingId(anchorHref(tag));
    if (id === undefined || !unavailableIds.has(id)) return anchor;
    return `<span>${body}<span class="article-link-unavailable"> — ${escapeAttribute(availability!.unavailable)}</span> <a href="${escapeAttribute(catalogPath)}">${escapeAttribute(availability!.catalog)}</a></span>`;
  }) : html;
  if (locale === 'ru') return visibleHtml;
  return visibleHtml.replace(anchorTag, tag => tag.replace(attributes, (attribute, space: string, name: string, equals: string, double: string | undefined, single: string | undefined) => {
    if (name.toLowerCase() !== 'href' || (double === undefined && single === undefined)) return attribute;
    const quote = double === undefined ? "'" : '"';
    const encoded = double ?? single ?? '';
    const href = decodeAttribute(encoded);
    if (!href.startsWith('/') || href.startsWith('//') || /[\s\\]/.test(href) || [...href].some(character => character.charCodeAt(0) < 32)) return attribute;
    const { basePath } = resolvePublicPath(href);
    const known = staticPages.has(basePath) || servicePage.test(basePath) || articlePage.test(basePath) || /^\/listing\/[1-9]\d*$/.test(basePath);
    if (!known || !isPublicPageComplete(basePath, completedPages)) return attribute;
    const localized = escapeAttribute(localizedPath(href, locale));
    return `${space}${name}${equals}${quote}${localized}${quote}`;
  }));
}
