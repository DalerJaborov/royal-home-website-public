/**
 * Contract: the catalog item id of a listing in the Meta real-estate catalog.
 *
 * It is the CRM card number (Property.shortId) as a string — the same number the
 * site prints as «объект №N» and the CRM feed emits as `home_listing_id`:
 *
 *   site:  metaContentId(listing) = listing.crmShortId != null ? String(listing.crmShortId) : undefined
 *   CRM:   home_listing_id        = String(property.shortId)
 *
 * The site stores the number in `listings.crm_short_id`, filled from the `shortId`
 * field of the CRM sync payload (api/crm-sync-router.ts). A row the CRM has not
 * numbered yet has no catalog id: its Pixel/CAPI events carrying content_ids are
 * skipped instead of inventing an id that Meta could never match to the feed.
 */
export interface MetaContentIdSource {
  crmShortId?: number | null;
}

/** Returns undefined when the CRM card number is missing or not a positive integer. */
export function metaContentId(listing: MetaContentIdSource): string | undefined {
  const number = listing.crmShortId;
  return typeof number === 'number' && Number.isSafeInteger(number) && number > 0 ? String(number) : undefined;
}
