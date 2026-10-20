import { z } from "zod";
import { createRouter, publicQuery, adminQuery } from "./middleware";
import { trackPageView, trackListingEvent, getAnalyticsSummary, getWeeklyChart, getPopularListings } from "./queries/analytics";
import { assertRateLimit } from "./lib/rate-limit";
import { LISTING_EVENT_KINDS } from "@contracts/constants";
import { recordMetaEvents, type MetaAction } from "./lib/meta-events";
import { metaEventIdSchema } from "./meta-router";

export const analyticsRouter = createRouter({
  // Public — fired once per route change from useAnalyticsTracker (site pages only, see client filter).
  track: publicQuery
    .input(z.object({ path: z.string().min(1).max(500), visitorId: z.string().uuid().optional() }))
    .mutation(async ({ input, ctx }) => {
      // A real visitor navigates at most a few dozen times per session — this only
      // stops a scripted flood from inflating the numbers, not normal browsing.
      assertRateLimit(ctx.req, "analytics-track", 120, 10 * 60 * 1000);
      if (input.path.startsWith("/admin")) return { ok: true };
      await trackPageView(input.path, input.visitorId);
      return { ok: true };
    }),

  // Public — клик по звонку/WhatsApp/Telegram/«поделиться»/«в избранное» на
  // карточке объекта (see src/hooks/useAnalytics.ts trackListingEvent). Раньше
  // такие клики видела только Яндекс.Метрика — CRM не могла построить воронку
  // покупателя по объекту (api/crm-sync-router.ts GET /stats).
  event: publicQuery
    .input(
      z.object({
        listingId: z.number().int().positive(),
        kind: z.enum(LISTING_EVENT_KINDS),
        visitorId: z.string().uuid().optional(),
        // Id события для дедупликации браузерного пикселя Meta и Conversions API
        // (docs/meta-pixel.md); без него сервер сам не сможет склеить две копии.
        metaEventId: metaEventIdSchema.optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Тот же смысл лимита, что у track выше — не количество кликов реального
      // посетителя, а потолок против скриптовой накрутки воронки.
      assertRateLimit(ctx.req, "analytics-event", 60, 10 * 60 * 1000);
      await trackListingEvent(input.listingId, input.kind, input.visitorId);
      // favorite → InitiateCheckout; phone/whatsapp/telegram → Purchase + Contact;
      // share has no catalog meaning. Never fails the request (recordMetaEvents swallows errors).
      const action: MetaAction | undefined = input.kind === "favorite"
        ? { kind: "InitiateCheckout", listingId: input.listingId }
        : input.kind === "share" ? undefined : { kind: "Contact", listingId: input.listingId };
      const metaEvents = action && input.metaEventId
        ? await recordMetaEvents({ action, eventId: input.metaEventId, req: ctx.req, visitorId: input.visitorId, isAdmin: ctx.user?.role === "admin" })
        : [];
      return { ok: true, metaEvents };
    }),

  // Admin — dashboard widgets
  summary: adminQuery.query(async () => {
    const [summary, weekly, popularListings] = await Promise.all([
      getAnalyticsSummary(),
      getWeeklyChart(),
      getPopularListings(),
    ]);
    return { ...summary, weekly, popularListings };
  }),
});
