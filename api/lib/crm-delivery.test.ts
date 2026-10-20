import { afterEach, expect, it, vi } from 'vitest';
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules(); vi.restoreAllMocks(); });
it.each([[429, true], [503, true], [400, false], [401, false]])('classifies HTTP %s without retaining a private response', async (status, retryable) => {
  vi.stubEnv('CRM_LEAD_URL', 'https://crm.example.test'); vi.stubEnv('CRM_LEAD_API_KEY', 'isolated-key');
  vi.resetModules(); vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ private: 'never-log' }, { status })));
  const { deliverCrmLead } = await import('./crm');
  expect(await deliverCrmLead({ fullName: 'Test', phone: '+992000000000', comment: 'isolated' })).toEqual({ error: `HTTP_${status}`, retryable });
});
it('retries malformed success responses instead of losing the lead', async () => {
  vi.stubEnv('CRM_LEAD_URL', 'https://crm.example.test'); vi.stubEnv('CRM_LEAD_API_KEY', 'isolated-key'); vi.resetModules();
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ok: true })));
  const { deliverCrmLead } = await import('./crm');
  expect(await deliverCrmLead({ fullName: 'Test', phone: '+992000000000', comment: '' })).toEqual({ error: 'invalid_response', retryable: true });
});
