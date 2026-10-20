import { useCallback, useEffect, useRef } from 'react';
import { trpc } from '@/providers/trpc';
import { useAdminAuth } from '@/contexts/AdminAuthContext';
import { getVisitorId } from '@/lib/visitorId';
import { firePageView, isMetaPixelLoaded, newMetaEventId, replayMetaEvents, setActiveListingId, startMetaPixel } from '@/lib/metaPixel';
import { META_SEARCH_MAX_IDS } from '@contracts/meta-events';

type TrackInput =
  | { event: 'PageView' }
  | { event: 'ViewContent'; listingId: number }
  | { event: 'Search'; listingIds: number[]; searchString?: string; district?: string };

/** Sends a page-level Meta event: server builds it and sends the Conversions API copy, the browser
 * replays it through fbq with the same event id. Never for admins; nothing at all without the pixel. */
function useMetaTrack() {
  const mutation = trpc.meta.track.useMutation();
  const { isAdmin, isLoading } = useAdminAuth();
  const { mutate } = mutation; // Stable identity in TanStack Query.
  const blocked = isLoading || isAdmin;
  return useCallback((input: TrackInput) => {
    if (blocked || !isMetaPixelLoaded()) return;
    startMetaPixel();
    const eventId = newMetaEventId();
    if (input.event === 'PageView') firePageView(eventId); // No data needed: fire at once, server copy follows.
    mutate(
      { ...input, eventId, visitorId: getVisitorId() },
      { onSuccess: (data) => { if (input.event !== 'PageView') replayMetaEvents(data.events, eventId); } },
    );
  }, [blocked, mutate]);
}

/** One PageView per route change (SPA), including the first page; admin routes are skipped. */
export function useMetaPageViews(pathname: string) {
  const track = useMetaTrack();
  useEffect(() => {
    if (pathname.startsWith('/admin')) return;
    track({ event: 'PageView' });
  }, [pathname, track]);
}

/** Listing page: remembers the listing for lead forms and reports ViewContent once per opened listing. */
export function useMetaListingView(listingId: number | undefined) {
  const track = useMetaTrack();
  useEffect(() => {
    if (listingId === undefined) return undefined;
    setActiveListingId(listingId);
    return () => setActiveListingId(undefined);
  }, [listingId]);
  useEffect(() => {
    if (listingId !== undefined) track({ event: 'ViewContent', listingId });
  }, [listingId, track]);
}

const SEARCH_DEBOUNCE_MS = 1000;

/** Catalog: reports Search with the top results after the filters settle (debounced, never twice for the same result set). */
export function useMetaSearch(listingIds: readonly number[], searchString: string, district: string, ready: boolean) {
  const track = useMetaTrack();
  const lastSent = useRef('');
  const ids = listingIds.slice(0, META_SEARCH_MAX_IDS);
  const key = `${ids.join(',')}|${searchString.trim()}|${district}`;
  useEffect(() => {
    if (!ready || ids.length === 0 || key === lastSent.current) return undefined;
    const timer = setTimeout(() => {
      lastSent.current = key;
      track({ event: 'Search', listingIds: ids, searchString: searchString.trim() || undefined, district: district && district !== 'Все районы' ? district : undefined });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // `ids` is derived from `key`; including the array itself would re-arm the timer on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ready, track]);
}
