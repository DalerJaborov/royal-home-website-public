import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, publicQuery, adminQuery } from "./middleware";
import { findAllLeads, findLeadById, updateLeadStatus } from "./queries/leads";
import { acceptQueuedLead, leadDeliveryStatuses, retryBlockedLeadDelivery, leadDeliveryHealth } from './queries/lead-deliveries';
import { assertRateLimit, clientIp } from "./lib/rate-limit";
import { forwardStatusToCrm } from "./lib/crm";
import { verifyRecaptcha } from "./lib/recaptcha";
import { normalizeLeadAttribution } from '@contracts/lead-attribution';
import { recordMetaEvents } from './lib/meta-events';
import type { MetaClientEvent } from '@contracts/meta-events';
import { metaEventIdSchema } from './meta-router';

// Minimum time a real person needs to see the form and fill it in. Scripted
// submitters that post immediately after loading the page land under this.
const MIN_FORM_FILL_MS = 1200;

export const leadRouter = createRouter({
  // Public — submitted from contact/sell/CTA forms across the site
  create: publicQuery
    .input(
      z.object({
        name: z.string().min(2).max(120).optional(),
        phone: z
          .string()
          .min(5, "Укажите номер телефона")
          .max(30)
          .refine((v) => (v.match(/\d/g)?.length ?? 0) >= 7, "Введите корректный номер телефона"),
        message: z.string().max(3000).optional(),
        source: z.string().min(1).max(100),
        attribution: z.unknown().optional().transform(normalizeLeadAttribution),
        // Anti-spam signals — invisible to real visitors, see useAntiSpam.ts:
        // `hp` is a honeypot field bots tend to auto-fill and humans never
        // see; `formRenderedAt` catches submissions posted implausibly fast.
        hp: z.string().max(200).optional(),
        formRenderedAt: z.number().int().nonnegative().optional(),
        recaptchaToken: z.string().max(4096).optional(),
        // Meta Pixel/CAPI (docs/meta-pixel.md): id для дедупликации и объект, с
        // карточки которого отправлена форма. Не сохраняются и в CRM не уходят.
        metaEventId: metaEventIdSchema.optional(),
        listingId: z.number().int().positive().optional(),
        visitorId: z.string().uuid().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Anti-spam: a real visitor sends a handful of forms at most
      assertRateLimit(ctx.req, "lead", 8, 10 * 60 * 1000, "Слишком много заявок подряд. Подождите немного и попробуйте снова.");

      const { hp, formRenderedAt, recaptchaToken, metaEventId, listingId, visitorId, ...data } = input;
      if (hp) {
        // Fake success — no error, nothing saved, nothing sent to the CRM.
        // Bots that see a rejection tend to adapt; ones that see "success"
        // usually don't bother retrying differently.
        return { id: 0, success: true };
      }
      const elapsed = typeof formRenderedAt === "number" ? Date.now() - formRenderedAt : undefined;
      // Browser clocks may be ahead of the server. A negative elapsed time
      // proves clock skew, not spam; CAPTCHA still verifies the submission.
      if (elapsed !== undefined && elapsed >= 0 && elapsed < MIN_FORM_FILL_MS) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Подождите пару секунд и повторите отправку заявки." });
      }

      const recaptchaOk = await verifyRecaptcha(recaptchaToken, clientIp(ctx.req));
      if (!recaptchaOk) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Не удалось проверить форму. Повторите отправку или позвоните нам." });
      }

      try {
        const id = await acceptQueuedLead(data, ctx.req.headers.get('referer') ?? undefined);
        const metaEvents = metaEventId
          ? await recordMetaEvents({ action: { kind: 'Lead', listingId }, eventId: metaEventId, req: ctx.req, visitorId, isAdmin: ctx.user?.role === 'admin' })
          : [];
        // Keep the historical { id, success } shape unless Meta has events for the browser to replay.
        const accepted: { id: number; success: true; metaEvents?: MetaClientEvent[] } = { id, success: true };
        if (metaEvents.length) accepted.metaEvents = metaEvents;
        return accepted;
      } catch {
        // A database driver error can embed SQL containing the visitor's PII.
        console.error('[lead-delivery] atomic_accept_failed');
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Не удалось сохранить заявку. Повторите отправку или позвоните нам.' });
      }
    }),

  // Admin — leads list shown in the dashboard
  list: adminQuery.query(async () => {
    const rows = await findAllLeads();
    const statuses = new Map((await leadDeliveryStatuses(rows.map(row => row.id))).map(row => [row.leadId, row]));
    return rows.map(row => ({ ...row, delivery: statuses.get(row.id) ?? null }));
  }),

  retryDelivery: adminQuery.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input }) => {
    await retryBlockedLeadDelivery(input.id);
    return { success: true };
  }),
  deliveryHealth: adminQuery.query(() => leadDeliveryHealth()),

  updateStatus: adminQuery
    .input(
      z.object({
        id: z.number(),
        status: z.enum(["new", "contacted", "closed"]),
      })
    )
    .mutation(async ({ input }) => {
      await updateLeadStatus(input.id, input.status);
      // Best-effort, fire-and-forget — see forwardStatusToCrm. Only leads that
      // actually made it to the CRM (crmClientId set) have anything to sync.
      const lead = await findLeadById(input.id);
      if (lead?.crmClientId) void forwardStatusToCrm(lead.crmClientId, input.status);
      return { success: true };
    }),
});
