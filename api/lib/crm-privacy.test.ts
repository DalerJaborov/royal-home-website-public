import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.resetModules(); });

it('does not log rejected webhook customer or credential data', async () => {
  vi.stubEnv('CRM_LEAD_URL', 'https://crm.example.test/website-lead');
  vi.stubEnv('CRM_LEAD_API_KEY', 'test-webhook-key');
  vi.resetModules();
  const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ customer: 'Private customer', phone: '+992900001234', key: 'test-webhook-key' }, { status: 400 })));
  const { forwardLeadToCrm } = await import('./crm');
  expect(await forwardLeadToCrm({ phone: '+992900001234', source: 'contacts:blog:example' })).toBeNull();
  const output = JSON.stringify(log.mock.calls);
  expect(output).toContain('HTTP 400');
  for (const privateValue of ['Private customer', '+992900001234', 'test-webhook-key']) expect(output).not.toContain(privateValue);
});
