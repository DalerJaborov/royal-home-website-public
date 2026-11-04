import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// Never run fixture writes against a live database.
const url = new URL(process.env.DATABASE_URL || 'mysql://invalid/invalid');
if (process.env.NODE_ENV === 'production' || !['127.0.0.1', 'localhost'].includes(url.hostname) || url.pathname !== '/royalhome_facts_test') {
  throw new Error('Requires the isolated local royalhome_facts_test database');
}
process.env.CRM_SYNC_API_KEY = 'isolated-facts-test';
const { crmSyncApp } = await import('../api/crm-sync-router');
const { createListing, findListingById, upsertListingByExternalId, findListingByExternalId, setListingPublishedByExternalId, setListingSoldByExternalId } = await import('../api/queries/listings');
const { getDb } = await import('../api/queries/connection');
const { listings } = await import('../db/schema');
const { eq } = await import('drizzle-orm');
const externalId = `facts-test-${randomUUID()}`;
let nativeId: number | undefined;
const source = { title: 'Изолированная проверка', location: 'Сино, Душанбе', price: 800000, rooms: 2, area: 60, category: 'APARTMENT' as const, imageUrls: ['https://example.com/fixture.webp'] };
const request = async (item: object) => {
  const response = await crmSyncApp.request('/listings', { method: 'POST', headers: { 'X-Api-Key': 'isolated-facts-test', 'Content-Type': 'application/json' }, body: JSON.stringify({ items: [{ externalId, ...item }] }) });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.results[0].ok, true, JSON.stringify(body));
};
try {
  nativeId = await createListing(source);
  const unknownNative = await findListingById(nativeId);
  assert.equal(unknownNative?.type, null); assert.equal(unknownNative?.stage, null); assert.equal(unknownNative?.repair, null);
  const id = await upsertListingByExternalId(externalId, source);
  assert(id);
  const oldSender = await findListingByExternalId(externalId);
  assert.equal(oldSender?.floor, null); assert.equal(oldSender?.repair, null); assert.equal(oldSender?.stage, null);
  assert.equal(oldSender?.type, null);
  await request({ action: 'publish', data: { ...source, floor: '16/18', totalFloors: 18, repair: 'Без отделки', stage: 'Коробка, черновые не сделаны', type: 'Вторичка' } });
  const actual = await findListingByExternalId(externalId);
  assert.equal(actual?.id, id); assert.equal(actual.floor, '16/18'); assert.equal(actual.totalFloors, 18); assert.equal(actual.repair, 'Без отделки');
  await setListingPublishedByExternalId(externalId, false);
  await setListingSoldByExternalId(externalId, true);
  await request({ action: 'facts', facts: { floor: null, repair: 'Требует ремонта', price: 1, imageUrls: [], title: 'must not replace' } });
  const repaired = await findListingByExternalId(externalId);
  assert.equal(repaired?.floor, null); assert.equal(repaired?.repair, 'Требует ремонта');
  assert.equal(repaired?.totalFloors, 18); assert.equal(repaired?.stage, actual.stage);
  assert.equal(repaired?.published, false); assert.equal(repaired?.sold, true);
  for (const key of ['title', 'price', 'imageUrls', 'metaTitle', 'metaDescription', 'h1', 'seoDesc'] as const) assert.deepEqual(repaired?.[key], actual[key]);
  await request({ action: 'facts', siteListingId: id, facts: { floor: '17/18', repair: null } });
  const native = await findListingByExternalId(externalId);
  assert.equal(native?.floor, '17/18'); assert.equal(native?.repair, null); assert.equal(native?.published, false);
  await request({ action: 'publish', data: source });
  const legacy = await findListingByExternalId(externalId);
  assert.equal(legacy?.floor, '17/18'); assert.equal(legacy?.repair, null);
  await request({ action: 'facts', facts: { floor: '17/18', totalFloors: 18, repair: 'Хорошее состояние', stage: null, urgent: false } });
  assert.equal((await findListingByExternalId(externalId))?.type, null);
  await request({ action: 'publish', data: source });
  assert.equal((await findListingByExternalId(externalId))?.type, null);
  await request({ action: 'publish', crmPriceVersion: 8, data: { ...source, price: 780000, description: 'Цена 780 000' } });
  await request({ action: 'publish', crmPriceVersion: 7, data: { ...source, price: 800000, description: 'Цена 800 000' } });
  await request({ action: 'publish', data: { ...source, price: 800000, description: 'Цена 800 000' } });
  const versioned = await findListingByExternalId(externalId);
  assert.equal(versioned?.price, 780000);
  assert.equal(versioned?.description, 'Цена 780 000');
  assert.equal(versioned?.crmPriceVersion, 8);

  // A native listing keeps its title/description and receives the new numeric price.
  const nativeListingId = nativeId;
  assert(nativeListingId);
  await request({ action: 'publish', siteListingId: nativeListingId, crmPriceVersion: 10, data: { ...source, title: 'Импорт', price: 760000 } });
  await request({ action: 'publish', siteListingId: nativeListingId, crmPriceVersion: 9, data: { ...source, price: 780000 } });
  const versionedNative = await findListingById(nativeListingId);
  assert.equal(versionedNative?.price, 760000);
  const [nativeVersion] = await getDb()!.select({ crmPriceVersion: listings.crmPriceVersion })
    .from(listings).where(eq(listings.id, nativeListingId));
  assert.equal(nativeVersion?.crmPriceVersion, 10);
  assert.equal(versionedNative?.title, source.title);

  await Promise.all([
    request({ action: 'publish', crmPriceVersion: 12, data: { ...source, price: 740000 } }),
    request({ action: 'publish', crmPriceVersion: 11, data: { ...source, price: 750000 } }),
  ]);
  assert.equal((await findListingByExternalId(externalId))?.price, 740000);
  console.log('PASS: real MySQL persistence, legacy compatibility, native price updates and ordered CRM prices');
} finally {
  await getDb()!.delete(listings).where(eq(listings.externalId, externalId));
  if (nativeId) await getDb()!.delete(listings).where(eq(listings.id, nativeId));
}
process.exit(0);
