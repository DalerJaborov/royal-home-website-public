import { describe, expect, it } from 'vitest';
import { listingFactsHtml } from './listing-facts';
import { listingFactRows } from '@contracts/listing-facts';

describe('verified property facts in visible and crawlable content', () => {
  it('prints actual floor and condition and omits unknown construction state', () => {
    const html = listingFactsHtml({ category: 'APARTMENT', floor: '16/18', repair: 'Без отделки', stage: null });
    expect(html).toContain('<dt>Этаж</dt><dd>16/18</dd>');
    expect(html).toContain('<dt>Ремонт</dt><dd>Без отделки</dd>');
    expect(html).not.toContain('Стадия'); expect(html).not.toContain('Новый ремонт');
  });
  it('translates labels/condition and retains numeric floor values in initial locale HTML', () => {
    const words: Record<string, string> = { Этаж: 'Floor', Ремонт: 'Condition', 'Без отделки': 'Unfinished' };
    const html = listingFactsHtml({ floor: '16/18', repair: 'Без отделки' }, value => words[value] ?? '');
    expect(html).toContain('<dt>Floor</dt><dd>16/18</dd>'); expect(html).toContain('<dt>Condition</dt><dd>Unfinished</dd>');
  });
  it('does not expose stale inapplicable market or floor fields on land/house cards', () => {
    expect(listingFactRows({ category: 'LAND', repair: 'Новый ремонт', floor: '16/18', stage: 'Построен' })).toEqual([]);
    expect(listingFactRows({ category: 'HOUSE', type: 'Новостройки', totalFloors: 2, floor: '16/18', repair: 'Хорошее состояние' })).toEqual([
      { label: 'Этажей в доме', value: '2' }, { label: 'Ремонт', value: 'Хорошее состояние' },
    ]);
  });
  it('escapes facts obtained from an external source', () => {
    expect(listingFactsHtml({ repair: '<img src=x onerror=alert(1)>' })).not.toContain('<img');
  });
});
