import { beforeEach, describe, expect, it, vi } from 'vitest';
const store = vi.hoisted(() => ({ row: undefined as Record<string, unknown> | undefined,
  writes: [] as Record<string, unknown>[], transactions: 0 }));
vi.mock('./connection', () => {
  const tx = {
    select: () => ({ from: () => ({ where: () => ({ for: async () => store.row ? [store.row] : [] }) }) }),
    update: () => ({ set: (patch: Record<string, unknown>) => ({ where: async () => {
      store.writes.push(patch); store.row = { ...store.row, ...patch };
    } }) }),
    insert: () => ({ values: async (row: Record<string, unknown>) => {
      store.row = { ...row, id: 901 }; return [{ insertId: 901 }];
    } }),
  };
  return { isDbAvailable: () => true, getDb: () => ({ ...tx, transaction: async (fn: (tx: unknown) => unknown) => {
    store.transactions++; return fn(tx);
  } }) };
});
import { upsertListingByExternalId, updateListingFactsFromCrm, updateListing } from './listings';
import { buildListingSeoMeta, buildListingSeoMetaTj } from '../lib/seo';
const facts = { title: 'Объект', location: 'Сино, Душанбе', price: 700000, rooms: 1, area: 41,
  floor: '2/9', category: 'APARTMENT' as const, type: null };
beforeEach(() => { store.row = undefined; store.writes = []; store.transactions = 0; });

describe('production query paths retain editorial copy while refreshing generated metadata', () => {
  it.each([['HOUSE', 'дом', 'хонаи'], ['LAND', 'участок', 'қитъаи'], ['COMMERCIAL', 'помещение', 'тиҷоратӣ']] as const)
    ('generates category-appropriate RU/TG metadata for a new %s instead of calling everything an apartment', async (category, ru, tg) => {
      await upsertListingByExternalId('local-category-fixture', { ...facts, category });
      expect(store.row?.metaTitle).toContain(ru);
      expect(store.row?.metaTitleTj).toContain(tg);
      expect(store.row?.metaTitle).not.toContain('квартир');
    });
  it('initial CRM publication fills RU and TG; the next sync refreshes previous room and area templates', async () => {
    await upsertListingByExternalId('local-crm-fixture', facts);
    expect(store.row?.metaTitleTj).toContain('41');
    expect(store.row?.metaDescription).toContain('700');
    store.row!.metaTitle = 'Ручной заголовок';
    await upsertListingByExternalId('local-crm-fixture', { ...facts, rooms: 3, area: 97, floor: '7/12', price: 1250000 });
    expect(store.row).toMatchObject({ metaTitle: 'Ручной заголовок', published: true });
    expect(store.row?.h1).toContain('97');
    expect(store.row?.h1Tj).toContain('97');
    expect(store.row?.descriptionTj).toContain('7/12');
  });
  it('an admin fact edit refreshes templates inside the transaction without publishing a draft', async () => {
    const source = { ...facts, type: undefined, district: 'Сино' };
    store.row = { ...facts, id: 901, published: false, ...buildListingSeoMeta(source), ...buildListingSeoMetaTj(source),
      metaDescription: 'Ручное описание' };
    await updateListing(901, { rooms: 3, area: 97, price: 1250000 });
    expect(store.transactions).toBe(1);
    expect(store.row).toMatchObject({ published: false, metaDescription: 'Ручное описание' });
    expect(store.row?.h1Tj).toContain('97');
    expect(store.writes[0]).not.toHaveProperty('published');
  });
  it('a facts-only sync refreshes the exact floor template and leaves manual text/photos/visibility intact', async () => {
    const source = { ...facts, type: undefined, district: 'Сино' };
    store.row = { ...facts, id: 901, published: false, imageUrls: ['/uploads/keep.webp'],
      ...buildListingSeoMetaTj(source), metaDescription: 'Ручное описание' };
    await updateListingFactsFromCrm({ id: 901 }, { floor: '7/12' });
    expect(store.row).toMatchObject({ published: false, imageUrls: ['/uploads/keep.webp'], metaDescription: 'Ручное описание' });
    expect(store.row?.descriptionTj).toContain('7/12');
    expect(Object.keys(store.writes[0]).sort()).toEqual(['descriptionTj', 'floor']);
  });
});
