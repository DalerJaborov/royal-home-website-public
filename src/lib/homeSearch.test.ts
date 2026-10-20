import { expect, it } from 'vitest';
import { homeSearchQuery } from './homeSearch';

it('keeps all four districts, property type and room choice in the destination', () => {
  for (const district of ['Сино', 'Шохмансур', 'Фирдавси', 'И. Сомони']) {
    const query = new URLSearchParams(homeSearchQuery({ category: 'APARTMENT', district, rooms: '4+' }));
    expect(Object.fromEntries(query)).toEqual({ category: 'APARTMENT', district, rooms: '4+' });
  }
});
it('omits defaults and arbitrary values from public navigation', () => {
  expect(homeSearchQuery({ category: 'all', district: 'Все районы', rooms: 'Комнаты' })).toBe('');
  expect(homeSearchQuery({ category: 'private', district: 'a@example.com', rooms: '+992123456789' })).toBe('');
});
