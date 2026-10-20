/** Public reference distinguishes listings with identical rooms/area/district.
 * It is the CRM card number (listings.crmShortId) — the one number visitors and the
 * CRM bot both use. Without a number the title is left as is: never the site row id. */
export function listingSeoTitle(title: string, crmShortId: number | null | undefined): string {
  if (typeof crmShortId !== 'number' || !Number.isSafeInteger(crmShortId) || crmShortId <= 0) return title;
  const suffix = ` · №${crmShortId}`;
  return !title.endsWith(suffix) ? title + suffix : title;
}
