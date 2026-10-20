import { afterEach, describe, expect, it, vi } from 'vitest';
import { deliveryRetryDelay, drainLeadDeliveries } from './lead-delivery-worker';
import { buildCrmLeadPayload, type CrmDeliveryResult, type CrmLeadPayload } from './crm';
import type { claimLeadDelivery } from '../queries/lead-deliveries';

afterEach(() => vi.restoreAllMocks());
describe('durable delivery policy', () => {
  it('backs off with a six-hour ceiling and no attempt-based deletion', () => {
    expect([1, 2, 3, 100].map(deliveryRetryDelay)).toEqual([15000, 30000, 60000, 21600000]);
  });
  it('retries an immutable payload after an uncertain response and then stores the CRM identity', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const payload = buildCrmLeadPayload({ phone: '+992000000000', source: 'isolated-test', pageUrl: 'https://royalhome.tj/listings?utm_source=test' });
    const job = { leadId: 1, attempts: 1, payload } as NonNullable<Awaited<ReturnType<typeof claimLeadDelivery>>>;
    const claim = vi.fn().mockResolvedValueOnce(job).mockResolvedValueOnce(null).mockResolvedValueOnce({ ...job, attempts: 2 }).mockResolvedValueOnce(null);
    const deliver = vi.fn<(payload: CrmLeadPayload) => Promise<CrmDeliveryResult>>().mockResolvedValueOnce({ error: 'TimeoutError', retryable: true }).mockResolvedValueOnce({ clientId: 'mock-client' });
    const finish = vi.fn().mockResolvedValue(undefined);
    await drainLeadDeliveries({ claim, deliver, finish });
    await drainLeadDeliveries({ claim, deliver, finish });
    expect(deliver.mock.calls.map(call => call[0])).toEqual([payload, payload]);
    expect(finish.mock.calls[0][1]).toEqual({ error: 'TimeoutError', retryable: true });
    expect(finish.mock.calls[1][1]).toEqual({ clientId: 'mock-client' });
    expect(payload.pageUrl).toBe('https://royalhome.tj/listings');
  });
});
