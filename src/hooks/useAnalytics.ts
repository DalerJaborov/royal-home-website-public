import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { trpc } from '@/providers/trpc';
import { useAdminAuth } from '@/contexts/AdminAuthContext';
import type { ListingEventKind } from '@contracts/constants';
import { getVisitorId } from '@/lib/visitorId';
import { recordAcquisitionVisit } from '@/lib/acquisitionAttribution';
import { prepareMetaEvent } from '@/lib/metaPixel';
import { useMetaPageViews } from './useMetaPixel';
export { getVisitorId };

/** Sends one pageview per route change to the server — see api/analytics-router.ts.
 * Previously this counted views in the browser's own localStorage, so the admin
 * dashboard only ever showed the admin's own browsing, never real visitor traffic.
 * Also skips tracking while browsing as a logged-in admin (any page, not just
 * /admin/*) — otherwise the admin's own visits while testing the site inflate
 * the "real visitor" numbers the dashboard is supposed to show. */
export function useAnalyticsTracker() {
  const location = useLocation();
  const track = trpc.analytics.track.useMutation();
  const { isAdmin, isLoading } = useAdminAuth();
  // Meta Pixel PageView (no-op unless META_PIXEL_ID is set; skips admins and /admin like the tracker below).
  useMetaPageViews(location.pathname);

  useEffect(() => {
    if (!isLoading && !isAdmin && !location.pathname.startsWith('/admin')) {
      recordAcquisitionVisit(location.pathname, location.search, document.referrer);
    }
  }, [location.pathname, location.search, isAdmin, isLoading]);

  useEffect(() => {
    if (location.pathname.startsWith('/admin')) return;
    if (isLoading || isAdmin) return;
    track.mutate({ path: location.pathname, visitorId: getVisitorId() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, isAdmin, isLoading]);
}

/** Клик по звонку/WhatsApp/Telegram/«поделиться» на карточке объекта — та
 * же CRM-воронка покупателя, что и favorite-add в FavoritesContext.tsx (см.
 * api/analytics-router.ts analytics.event). Возвращает функцию для onClick,
 * а не хук с эффектом: клик — дискретное событие, не смена маршрута.
 *
 * Fire-and-forget и без ошибок наружу: клик посетителя (звонок, WhatsApp)
 * никогда не должен тормозиться или падать из-за аналитики. `.mutate()`
 * (не `.mutateAsync()`) tRPC/react-query уже не бросает необработанный
 * reject — ошибка уходит только во внутреннее состояние мутации.
 */
export function useTrackListingEvent() {
  const event = trpc.analytics.event.useMutation();
  const { isAdmin, isLoading } = useAdminAuth();

  return (listingId: number, kind: ListingEventKind) => {
    if (isLoading || isAdmin) return;
    // phone/whatsapp/telegram -> Meta Purchase + Contact (server builds them, browser replays with the same id).
    const meta = prepareMetaEvent();
    event.mutate({ listingId, kind, visitorId: getVisitorId(), metaEventId: meta.metaEventId }, { onSuccess: (data) => meta.replay(data.metaEvents) });
  };
}
