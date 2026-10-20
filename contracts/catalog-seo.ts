/** Filtered SPA views are useful to visitors, but are not independent SEO landings.
 * The catalog uses load-more, not URL pagination; ?page=2 must not be indexed.
 * Campaign parameters do not change the inventory and are ignored here.
 */
export function catalogNeedsNoindex(params: URLSearchParams): boolean {
  return [...params.keys()].some((key) =>
    !key.toLowerCase().startsWith("utm_") &&
    !["gclid", "yclid", "fbclid", "_openstat"].includes(key.toLowerCase())
  );
}
