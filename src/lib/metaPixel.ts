import type { MetaClientEvent } from '@contracts/meta-events';

/** Browser half of the Meta Pixel integration (docs/meta-pixel.md). All of it is a no-op
 * unless the server injected public/meta-pixel-loader.js, i.e. META_PIXEL_ID is set. */
declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    rhMetaPixel?: { start: () => void };
  }
}

export const isMetaPixelLoaded = (): boolean => typeof window !== 'undefined' && typeof window.fbq === 'function';

/** Loads fbevents.js. Called only once the visitor is known not to be an admin. */
export function startMetaPixel(): void {
  try { window.rhMetaPixel?.start(); } catch { /* Measurement never breaks the page. */ }
}

/** Matches contracts/meta-events META_EVENT_ID_PATTERN; the same id is used by the server copy (CAPI). */
export function newMetaEventId(): string {
  try {
    const uuid = globalThis.crypto?.randomUUID?.();
    if (uuid) return uuid;
  } catch { /* Fall through to the random fallback. */ }
  return `rh${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

function fire(name: string, params: MetaClientEvent['params'], eventId: string): void {
  try { window.fbq?.('track', name, params, { eventID: eventId }); } catch { /* Ad blockers may break fbq. */ }
}

export function firePageView(eventId: string): void {
  if (isMetaPixelLoaded()) fire('PageView', {}, eventId);
}

/** Replays the events the server built (and already sent through the Conversions API) with the same event id. */
export function replayMetaEvents(events: readonly MetaClientEvent[] | undefined, eventId: string): void {
  if (!isMetaPixelLoaded()) return;
  for (const event of events ?? []) fire(event.name, event.params, eventId);
}

/** Id for one visitor action plus the callback that replays the server's answer. */
export function prepareMetaEvent(): { metaEventId: string | undefined; replay: (events?: readonly MetaClientEvent[]) => void } {
  const metaEventId = isMetaPixelLoaded() ? newMetaEventId() : undefined;
  return { metaEventId, replay: (events) => { if (metaEventId) replayMetaEvents(events, metaEventId); } };
}

let activeListingId: number | undefined;
/** The listing page the visitor is on; lead forms attach it so a lead can become a catalog Purchase. */
export const setActiveListingId = (id: number | undefined): void => { activeListingId = id; };
export const getActiveListingId = (): number | undefined => activeListingId;
