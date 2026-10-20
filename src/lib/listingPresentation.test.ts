import { describe, expect, it, vi } from 'vitest';
import { listingTitle, listingDescription, listingLocation } from './listingPresentation';
import type { Listing } from '@/data/listings';

const property: Listing = { id: 98, title: 'Дом 4-комнатный', titleTj: '', location: 'Душанбе, р-н Шохмансур', price: 1200000, rooms: 4, area: 150, floor: '2', type: 'Вторичка', stage: 'Построен', repair: '', images: 0, urgent: false, date: '15.10.2026', seoDesc: '', description: 'Описание на русском', category: 'HOUSE' };
const identity = (value: string) => value;
describe('factual localized property presentation', () => {
  it('keeps the original Russian title while describing the correct category in other languages', () => {
    expect(listingTitle(property, 'ru', identity)).toBe(property.title);
    expect(listingTitle(property, 'tg', identity)).toContain('Хонаи алоҳидаи 4-ҳуҷрагӣ');
    expect(listingTitle(property, 'tg', identity)).not.toContain('Квартира');
    expect(listingTitle(property, 'en', identity)).toBe('4-room house, 150 m² in Dushanbe');
  });
  it('uses actual facts instead of pretending unknown Russian source content is translated', () => {
    expect(listingDescription(property, 'tg', identity).replace(/\s/g, '')).toContain('1200000');
    expect(listingDescription(property, 'tg', identity)).not.toContain(property.description);
    expect(listingDescription(property, 'en', identity)).toContain('1,200,000 somoni');
    expect(listingLocation(property, 'tg', identity)).toBe('Душанбе, Шоҳмансур');
    expect(property.title).toBe('Дом 4-комнатный');
  });
  it('keeps Tajik SSR card descriptions stable when browser ICU formats numbers differently', () => {
    const server = listingDescription(property, 'tg', identity);
    const formatter = vi.spyOn(Number.prototype, 'toLocaleString').mockReturnValue('1,200,000');
    try {
      expect(listingDescription(property, 'tg', identity)).toBe(server);
      expect(server).toContain('Нарх: 1\u00a0200\u00a0000 сомонӣ.');
      expect(formatter).not.toHaveBeenCalled();
    } finally { formatter.mockRestore(); }
  });
});
