import { expect, it } from 'vitest';
import { listingSeoTitle } from '@contracts/listing-seo-title';

it('distinguishes identical property titles with the CRM card number', () => {
  const title = 'Купить 3-комнатную квартиру 105 м² в Душанбе';
  expect(listingSeoTitle(title, 99)).toBe(title + ' · №99');
  expect(listingSeoTitle(title, 103)).not.toBe(listingSeoTitle(title, 99));
  expect(listingSeoTitle('Хонаи 3-ҳуҷрагӣ дар Душанбе', 103)).toContain('№103');
});
it('leaves the title alone when the CRM card number is unknown', () => {
  expect(listingSeoTitle('Объект', null)).toBe('Объект');
  expect(listingSeoTitle('Объект', undefined)).toBe('Объект');
});
it('does not duplicate a reference or attach an invalid identifier', () => {
  expect(listingSeoTitle(listingSeoTitle('Объект', 99), 99)).toBe('Объект · №99');
  for (const id of [0, -1, NaN, Infinity]) expect(listingSeoTitle('Объект', id)).toBe('Объект');
});
