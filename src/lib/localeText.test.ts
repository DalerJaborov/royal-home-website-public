import { describe, expect, it } from 'vitest';
import { localeText, translateDisplayStrings } from './localeText';
import { localizeTo } from './localizedTo';
import { localizedPath } from '@contracts/public-i18n';

describe('explicit display translation', () => {
  it('lets the translation reorder placeholders without changing factual values', () => {
    expect(localeText('Найдено {0} {1}', { 'Найдено {0} {1}': '{0} {1} ёфт шуд' }, { 0: 51, 1: 'объект' })).toBe('51 объект ёфт шуд');
    expect(localeText('Фото {0}', {}, { 0: 2 })).toBe('Фото 2');
  });
  it('does not mutate stored CMS content or its field identities', () => {
    const stored = { title: 'Купить', active: true, selected: [98], phone: '+992000000000' };
    const displayed = translateDisplayStrings(stored, value => value === 'Купить' ? 'Харидан' : value);
    expect(displayed.title).toBe('Харидан');
    expect(displayed.selected).toEqual([98]);
    expect(stored.title).toBe('Купить');
    expect(displayed.phone).toBe(stored.phone);
  });
  it('localizes the compact currency suffix without changing the amount', () => {
    expect(localeText('1 250 000 с.', { 'с.': 'TJS' })).toBe('1 250 000 TJS');
    expect(localeText('51', { 'с.': 'TJS' })).toBe('51');
    expect(localeText('61 м²', { 'м²': 'm²' })).toBe('61 m²');
    expect(localeText('Площадь 61 м²', { 'м²': 'm²' })).toBe('Площадь 61 м²');
  });
  it('keeps unknown text literal even when it matches inherited object keys', () => {
    expect(localeText('constructor', {})).toBe('constructor');
    expect(localeText('__proto__', {})).toBe('__proto__');
  });
  it('preserves filters and anchors for real localized navigation', () => {
    const path = (value: string) => localizedPath(value, 'tg');
    expect(localizeTo('/listings?rooms=2&district=Сино#results', path)).toBe('/tg/khonaho-dushanbe?rooms=2&district=Сино#results');
    expect(localizeTo({ pathname: '/listing/98', search: '?from=catalog', hash: '#photos' }, path)).toEqual({ pathname: '/tg/khona/98', search: '?from=catalog', hash: '#photos' });
    expect(localizeTo('https://wa.me/992000000000', path)).toBe('https://wa.me/992000000000');
    expect(localizeTo('/admin/login', path)).toBe('/admin/login');
  });
});
