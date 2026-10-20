import { claimLeadDelivery, finishLeadDelivery } from '../queries/lead-deliveries';
import { deliverCrmLead } from './crm';

export function deliveryRetryDelay(attempts: number) {
  return Math.min(6 * 60 * 60_000, 15_000 * 2 ** Math.min(Math.max(attempts - 1, 0), 11));
}

export async function drainLeadDeliveries(deps = {
  claim: claimLeadDelivery, deliver: deliverCrmLead, finish: finishLeadDelivery,
}) {
  for (let i = 0; i < 10; i++) {
    const job = await deps.claim();
    if (!job) return;
    const result = await deps.deliver(job.payload);
    await deps.finish(job, result, new Date(Date.now() + deliveryRetryDelay(job.attempts)));
    if (!('clientId' in result)) {
      // Identifiers/codes only; never log the payload, request URL or secrets.
      console.error(`[lead-delivery] lead=${job.leadId} attempt=${job.attempts} ${result.error} ${result.retryable ? 'retry' : 'blocked'}`);
    }
  }
}

export function startLeadDeliveryWorker() {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try { await drainLeadDeliveries(); }
    catch { console.error('[lead-delivery] worker_failed; persisted jobs retained'); }
    finally { running = false; }
  };
  const timer = setInterval(() => { void tick(); }, 15_000);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}
