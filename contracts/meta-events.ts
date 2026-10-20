/**
 * Meta (Facebook) real-estate catalog events — shared between the server that
 * builds them (api/lib/meta-events.ts) and the browser that replays them through
 * fbq with the same event id (src/lib/metaPixel.ts), so the Pixel and the
 * Conversions API copy of one event deduplicate.
 *
 * Spec: https://developers.facebook.com/documentation/ads-commerce/marketing-api/real-estate-ads/audience
 */
export const META_CONTENT_TYPE = 'home_listing';
/** All catalog inventory is in Dushanbe; city and region coincide (city under republican jurisdiction). */
export const META_GEO = { city: 'Dushanbe', region: 'Dushanbe', country: 'Tajikistan' } as const;
/** Meta's Search event wants "top results": ten ids is enough and keeps the request small. */
export const META_SEARCH_MAX_IDS = 10;
export const META_EVENT_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

export type MetaEventName = 'PageView' | 'ViewContent' | 'Search' | 'InitiateCheckout' | 'Purchase' | 'Contact' | 'Lead';

/** One event as the browser must fire it: fbq('track', name, params, { eventID }). */
export interface MetaClientEvent {
  name: MetaEventName;
  params: Record<string, string | number | string[]>;
}
