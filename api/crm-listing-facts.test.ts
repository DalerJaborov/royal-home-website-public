import { beforeEach, describe, expect, it, vi } from 'vitest';
const queries = vi.hoisted(() => ({
  upsertListingByExternalId: vi.fn(async () => 98),
  updateListingFactsFromCrm: vi.fn(async () => 98 as number | null),
  setListingPublishedByExternalId: vi.fn(), setListingSoldByExternalId: vi.fn(),
  setListingPublishedById: vi.fn(), setListingSoldById: vi.fn(),
}));
vi.mock('./queries/listings', () => queries);
import { crmSyncApp } from './crm-sync-router';
const data = { title: 'Квартира', location: 'Сино, Душанбе', price: 800000, rooms: 2, area: 60, category: 'APARTMENT', floor: '16/18', totalFloors: 18, repair: 'Без отделки', stage: null };
const request = (item: object) => crmSyncApp.request('/listings', { method: 'POST', headers: { 'X-Api-Key': 'facts-test', 'Content-Type': 'application/json' }, body: JSON.stringify({ items: [{ externalId: 'crm-property', ...item }] }) });
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv('CRM_SYNC_API_KEY', 'facts-test'); queries.updateListingFactsFromCrm.mockResolvedValue(98); });

describe('CRM listing facts at the HTTP boundary', () => {
  it('clears an unconfirmed market type only for the complete v1 repair snapshot', async () => {
    await request({ action: 'facts', facts: { floor: '16/18', totalFloors: 18, repair: 'Хорошее состояние', stage: null, urgent: false } });
    expect(queries.updateListingFactsFromCrm).toHaveBeenCalledWith({ externalId: 'crm-property' }, expect.objectContaining({ type: null }));
    queries.updateListingFactsFromCrm.mockClear();
    await request({ action: 'facts', facts: { repair: null } });
    expect(queries.updateListingFactsFromCrm).toHaveBeenCalledWith({ externalId: 'crm-property' }, { repair: null });
  });
  it('retains floor, building height and explicit empty condition on publish', async () => {
    const res = await request({ action: 'publish', data });
    expect(res.status).toBe(200);
    expect(queries.upsertListingByExternalId).toHaveBeenCalledWith('crm-property', expect.objectContaining({ floor: '16/18', totalFloors: 18, repair: 'Без отделки', stage: null }));
  });
  it('updates only facts without publishing, creating or replacing a listing', async () => {
    const res = await request({ action: 'facts', facts: { floor: '16/18', repair: null, title: 'must be ignored', price: 1 } });
    expect((await res.json() as { results: Array<{ ok: boolean; id: number }> }).results[0]).toMatchObject({ ok: true, id: 98 });
    expect(queries.updateListingFactsFromCrm).toHaveBeenCalledWith({ externalId: 'crm-property' }, { floor: '16/18', repair: null });
    expect(queries.upsertListingByExternalId).not.toHaveBeenCalled();
    expect(queries.setListingPublishedById).not.toHaveBeenCalled();
  });
  it('also updates approved facts on a site-native listing while retaining its own content', async () => {
    await request({ action: 'publish', siteListingId: 98, data });
    expect(queries.setListingPublishedById).toHaveBeenCalledWith(98, true);
    expect(queries.updateListingFactsFromCrm).toHaveBeenCalledWith({ id: 98 }, expect.objectContaining({ floor: '16/18' }));
    expect(queries.upsertListingByExternalId).not.toHaveBeenCalled();
  });
  it('reports a missing listing honestly instead of creating it during a facts update', async () => {
    queries.updateListingFactsFromCrm.mockResolvedValue(null);
    const res = await request({ action: 'facts', facts: { repair: null } });
    expect((await res.json() as { results: Array<{ ok: boolean }> }).results[0].ok).toBe(false);
    expect(queries.upsertListingByExternalId).not.toHaveBeenCalled();
  });
  it.each([{ totalFloors: -1 }, { totalFloors: 1.5 }, { floor: 16 }, { repair: 'x'.repeat(256) }, {}])('rejects invalid fact payload %j', async facts => {
    const res = await request({ action: 'facts', facts });
    expect(res.status).toBe(400);
    expect(queries.updateListingFactsFromCrm).not.toHaveBeenCalled();
  });
});
