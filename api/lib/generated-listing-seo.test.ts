import { describe, expect, it } from 'vitest';
import { buildListingSeoMeta, buildListingSeoMetaTj, refreshGeneratedListingSeo, type ListingSeoInput } from './seo';

const facts = { title: 'Квартира', location: 'Сино, Душанбе', price: 1200000, rooms: 2, area: 84, category: 'APARTMENT' as const, type: null };
const input = (extra: Partial<ListingSeoInput> = {}) => ({ ...facts, type: undefined, district: 'Сино', ...extra });
describe('generated property metadata follows current facts', () => {
  it('refreshes Tajik templates after a change in rooms, area, district and floor', () => {
    const previous = { ...facts, rooms: 1, area: 50, floor: '2/9' };
    const old = buildListingSeoMetaTj(input({ rooms: 1, area: 50, floor: '2/9' }));
    const next = { ...facts, location: 'Фирдавси, Душанбе', floor: '7/12', ...old };
    const expected = buildListingSeoMetaTj(input({ district: 'Фирдавси', floor: '7/12' }));
    expect(refreshGeneratedListingSeo(next, previous)).toMatchObject(expected);
  });
  it('repairs stale automatic Tajik prices on read but preserves editorial translations', () => {
    const old = buildListingSeoMetaTj(input({ price: 750000 }));
    const row = { ...facts, ...old, h1Tj: 'Хонаи зебо барои оилаи шумо', descriptionTj: 'Тавсифи муаллиф бо ҷузъиёти воқеӣ.' };
    expect(refreshGeneratedListingSeo(row)).toMatchObject({
      metaDescriptionTj: buildListingSeoMetaTj(input()).metaDescriptionTj,
      h1Tj: row.h1Tj, descriptionTj: row.descriptionTj,
    });
  });
  it.each([[793440, 791730], [6032000, 6019000], [1425408, 1444560], [1050755, 1049621], [1438400, 1200000]])('repairs the exact stale price template %s → %s', (before, after) => {
    const old = buildListingSeoMeta(input({ price: before })).metaDescription;
    const row = { ...facts, price: after, metaDescription: old, seoDesc: old };
    const result = refreshGeneratedListingSeo(row);
    expect(result.metaDescription).toBe(buildListingSeoMeta(input({ price: after })).metaDescription);
    expect(result.seoDesc).toBe(result.metaDescription);
    expect(row.metaDescription).toBe(old);
    expect(result.price).toBe(after);
  });
  it('removes an unsupported market classification after facts-only sync', () => {
    const old = buildListingSeoMeta(input({ type: 'Новостройки', price: 1438400 })).metaDescription;
    expect(refreshGeneratedListingSeo({ ...facts, metaDescription: old }).metaDescription).toBe(buildListingSeoMeta(input()).metaDescription);
  });
  it('preserves editorial fields independently, including similar wording and prices', () => {
    const old = buildListingSeoMeta(input({ price: 1438400 })).metaDescription;
    const row = { ...facts, metaTitle: 'Авторский заголовок', h1: 'Наша квартира', metaDescription: old.replace('Проверенный', 'Светлый'), seoDesc: 'Цена 1 438 400 сомони. Авторский текст.' };
    expect(refreshGeneratedListingSeo(row)).toEqual(row);
    expect(refreshGeneratedListingSeo({ ...facts, seoDesc: null }).seoDesc).toBeNull();
  });
  it('refreshes exact previous title and room/area templates during full sync', () => {
    const previous = { ...facts, rooms: 1, area: 50 };
    const old = buildListingSeoMeta(input({ rooms: 1, area: 50 }));
    const row = { ...facts, ...old, seoDesc: old.metaDescription };
    const result = refreshGeneratedListingSeo(row, previous);
    expect(result.metaTitle).toBe(buildListingSeoMeta(input()).metaTitle);
    expect(result.h1).toBe(buildListingSeoMeta(input()).h1);
    expect(result.metaDescription).toBe(buildListingSeoMeta(input()).metaDescription);
    expect(refreshGeneratedListingSeo(result)).toEqual(result);
  });
});
