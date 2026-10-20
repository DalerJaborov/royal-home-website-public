import { resolvePublicPath } from '@contracts/public-i18n';

/** Home already contains its complete visible HTML. Its hydration downloads
 * can yield bandwidth to the fonts and hero without delaying script execution
 * once downloaded or changing routes that still need JavaScript to render. */
export function prioritizeHomePaint(html: string, path: string, completePage: boolean): string {
  if (!completePage || resolvePublicPath(path).basePath !== '/') return html;
  return html.replace(/<(?:script|link)\b[^>]*>/gi, tag => {
    const module = /^<script\b/i.test(tag) && /\btype="module"/i.test(tag)
      && /\bsrc="\/assets\/[a-zA-Z0-9_.-]+\.js"/i.test(tag);
    const preload = /^<link\b/i.test(tag) && /\brel="modulepreload"/i.test(tag)
      && /\bhref="\/assets\/[a-zA-Z0-9_.-]+\.js"/i.test(tag);
    if (!module && !preload) return tag;
    return /\bfetchpriority="[^"]*"/i.test(tag)
      ? tag.replace(/\bfetchpriority="[^"]*"/i, 'fetchpriority="low"')
      : tag.replace(/\s*\/?>$/, ' fetchpriority="low">');
  });
}

/** Stable public CSS may have a content-version query. Read only local generated assets. */
export function localStylesheetPath(tag: string): string | undefined {
  if (!/\brel="stylesheet"/i.test(tag)) return;
  const href = /\bhref="([^"<>]+)"/i.exec(tag)?.[1];
  const pathname = href?.split(/[?#]/, 1)[0];
  return pathname && /^\/(?:fonts\.css|assets\/[a-zA-Z0-9_.-]+\.css)$/.test(pathname) ? pathname : undefined;
}
export function prioritizeHeadingFont(html: string, path: string, completePage = false): string {
  const { locale, basePath } = resolvePublicPath(path);
  const fontHint = /<link\b[^>]*rel="preload"[^>]*as="font"[^>]*href="\/fonts\/unbounded-700-cyrillic\.woff2"[^>]*>/;
  // The catalogue's LCP is its first photo: leave its head-start uncontested.
  // Fonts still load normally from the same inlined definitions and styles.
  if (completePage && basePath === '/listings') return html.replace(fontHint, locale === 'ru'
    ? ['unbounded-700-cyrillic', 'unbounded-catalog-numerals-v1'].map(font => `<link rel="preload" as="font" type="font/woff2" href="/fonts/${font}.woff2" crossorigin>`).join('\n') : '');
  if (completePage) {
    // These exact faces are used in the visible header, heading and controls.
    // Discover them together instead of waiting for layout to reveal each face.
    const fonts = locale === 'en' ? ['unbounded-700-latin-core-v1', 'inter-400-latin-core-v1']
      : locale === 'tg' ? ['inter-400-cyrillic', 'inter-400-cyrillic-ext', 'inter-400-latin-core-v1']
        : ['inter-400-cyrillic', 'inter-400-latin-core-v1', 'unbounded-700-cyrillic', 'unbounded-700-latin-core-v1'];
    return html.replace(fontHint,
      // Russian hero copy uses Inter. Let the small Latin wordmark yield to
      // that text; English's actual heading keeps its ordinary priority.
      () => fonts.map(font => `<link rel="preload" as="font" type="font/woff2" href="/fonts/${font}.woff2" crossorigin${locale === 'ru' && font === 'unbounded-700-latin-core-v1' ? ' fetchpriority="low"' : ''}>`).join('\n'));
  }
  const latin = locale === 'en';
  return html.replace('href="/fonts/unbounded-700-cyrillic.woff2" crossorigin',
    `href="/fonts/unbounded-700-${latin ? 'latin-core-v1' : 'cyrillic'}.woff2" crossorigin`);
}
