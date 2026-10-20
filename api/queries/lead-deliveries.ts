import { randomUUID } from 'node:crypto';
import { and, eq, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { leads, leadDeliveries } from '@db/schema';
import { getDb, isDbAvailable } from './connection';
import { createLead } from './leads';
import { buildCrmLeadPayload, forwardLeadToCrm } from '../lib/crm';
import type { LeadAttribution } from '@contracts/lead-attribution';

export async function acceptQueuedLead(input: Parameters<typeof createLead>[0] & { attribution?: LeadAttribution }, pageUrl?: string) {
  const { attribution, ...data } = input;
  if (!isDbAvailable()) {
    const id = await createLead(data);
    // Development fixture store only; production connection.ts forbids this path.
    const clientId = await forwardLeadToCrm({ ...data, attribution, pageUrl });
    if (clientId) {
      const { setLeadCrmClientId } = await import('./leads');
      await setLeadCrmClientId(id, clientId);
    }
    return id;
  }
  return getDb()!.transaction(async (tx) => {
    const [row] = await tx.insert(leads).values(data);
    await tx.insert(leadDeliveries).values({ leadId: row.insertId, payload: buildCrmLeadPayload({ ...data, attribution, pageUrl }) });
    return row.insertId;
  });
}

export async function claimLeadDelivery() {
  if (!isDbAvailable()) return null;
  const db = getDb()!;
  const token = randomUUID();
  const now = new Date();
  // One atomic UPDATE elects a worker, including across processes. A crashed
  // worker's lease expires; the exact persisted payload is used on every retry.
  const [result] = await db.update(leadDeliveries).set({
    leaseToken: token, leaseUntil: new Date(now.getTime() + 60_000),
    attempts: sql`${leadDeliveries.attempts} + 1`,
  }).where(and(eq(leadDeliveries.state, 'pending'), lte(leadDeliveries.nextAttemptAt, now),
    or(isNull(leadDeliveries.leaseUntil), lte(leadDeliveries.leaseUntil, now))))
    .orderBy(leadDeliveries.nextAttemptAt).limit(1);
  if (!result.affectedRows) return null;
  const [row] = await db.select().from(leadDeliveries).where(eq(leadDeliveries.leaseToken, token)).limit(1);
  return row ?? null;
}

export async function finishLeadDelivery(job: typeof leadDeliveries.$inferSelect, result:
  { clientId: string } | { error: string; retryable: boolean }, retryAt: Date) {
  const db = getDb()!;
  await db.transaction(async (tx) => {
    const [saved] = await tx.update(leadDeliveries).set('clientId' in result ? {
      state: 'delivered', deliveredAt: new Date(), lastError: null, leaseToken: null, leaseUntil: null,
    } : {
      state: result.retryable ? 'pending' : 'blocked', lastError: result.error,
      nextAttemptAt: retryAt, leaseToken: null, leaseUntil: null,
    }).where(and(eq(leadDeliveries.leadId, job.leadId), eq(leadDeliveries.leaseToken, job.leaseToken!)));
    if (saved.affectedRows && 'clientId' in result) {
      await tx.update(leads).set({ crmClientId: result.clientId }).where(eq(leads.id, job.leadId));
    }
  });
}

export async function leadDeliveryStatuses(ids: number[]) {
  if (!isDbAvailable() || !ids.length) return [];
  // No wire payload (phone/message) in this administrative status response.
  return getDb()!.select({ leadId: leadDeliveries.leadId, state: leadDeliveries.state,
    attempts: leadDeliveries.attempts, lastError: leadDeliveries.lastError,
    nextAttemptAt: leadDeliveries.nextAttemptAt, deliveredAt: leadDeliveries.deliveredAt,
  }).from(leadDeliveries).where(inArray(leadDeliveries.leadId, ids));
}

export async function retryBlockedLeadDelivery(leadId: number) {
  if (!isDbAvailable()) return;
  // Only a blocked job is released. An in-flight lease cannot be stolen.
  await getDb()!.update(leadDeliveries).set({ state: 'pending', nextAttemptAt: new Date(), lastError: null })
    .where(and(eq(leadDeliveries.leadId, leadId), eq(leadDeliveries.state, 'blocked')));
}

export async function leadDeliveryHealth() {
  if (!isDbAvailable()) return [];
  return getDb()!.select({ state: leadDeliveries.state, count: sql<number>`count(*)`.mapWith(Number),
    oldest: sql<Date | string | null>`min(${leadDeliveries.createdAt})`,
  }).from(leadDeliveries).groupBy(leadDeliveries.state);
}
