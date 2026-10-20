/**
 * CRM photo URLs arrive absolute — historically `http://85.198.70.182/uploads/…`,
 * now `https://crm.royalhome.tj/uploads/…`. Both die the moment the host or the
 * scheme changes (the old-IP batch is broken on prod right now: HTTPS pages
 * block http:// images as mixed content, and CSP img-src is 'self').
 *
 * Caddy serves the same files same-origin on royalhome.tj/uploads/*, so we
 * store and serve them host-relative: immune to any future domain/IP move and
 * always allowed by CSP.
 */
export function toRelativeUploadUrl(url: string): string {
  const m = /^https?:\/\/[^/]+(\/uploads\/.+)$/i.exec(url);
  return m ? m[1] : url;
}

export function normalizeImageUrls(urls: string[]): string[];
export function normalizeImageUrls(urls: string[] | null | undefined): string[] | null | undefined;
export function normalizeImageUrls(urls: string[] | null | undefined): string[] | null | undefined {
  if (!urls) return urls;
  return urls.map(toRelativeUploadUrl);
}
