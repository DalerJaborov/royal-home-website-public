import { z } from 'zod';
import { createRouter, publicQuery } from './middleware';
import { assertRateLimit } from './lib/rate-limit';
import { recordMetaEvents, type MetaAction } from './lib/meta-events';
import { META_EVENT_ID_PATTERN, META_SEARCH_MAX_IDS } from '@contracts/meta-events';

export const metaEventIdSchema = z.string().regex(META_EVENT_ID_PATTERN);
const listingId = z.number().int().positive();
const base = { eventId: metaEventIdSchema, visitorId: z.string().uuid().optional() };

/** Page-level events that have no server-side twin in analytics.event / lead.create. */
export const metaTrackInput = z.discriminatedUnion('event', [
  z.object({ ...base, event: z.literal('PageView') }),
  z.object({ ...base, event: z.literal('ViewContent'), listingId }),
  z.object({
    ...base,
    event: z.literal('Search'),
    listingIds: z.array(listingId).max(META_SEARCH_MAX_IDS),
    searchString: z.string().trim().max(100).optional(),
    district: z.string().trim().max(100).optional(),
  }),
]);

export const metaRouter = createRouter({
  // Public. Returns the events the browser must replay through fbq with the same
  // eventId (deduplication with the Conversions API copy sent from here).
  // Empty list when the pixel is not configured, so the client does nothing.
  track: publicQuery.input(metaTrackInput).mutation(async ({ input, ctx }) => {
    // Page views + views + searches of a real visitor: well under this ceiling;
    // it only stops a scripted flood from burning Conversions API quota.
    assertRateLimit(ctx.req, 'meta-track', 300, 10 * 60 * 1000);
    const action: MetaAction = input.event === 'Search'
      ? { kind: 'Search', listingIds: input.listingIds, searchString: input.searchString || undefined, district: input.district || undefined }
      : input.event === 'ViewContent'
        ? { kind: 'ViewContent', listingId: input.listingId }
        : { kind: 'PageView' };
    const events = await recordMetaEvents({
      action, eventId: input.eventId, req: ctx.req, visitorId: input.visitorId, isAdmin: ctx.user?.role === 'admin',
    });
    return { events };
  }),
});
