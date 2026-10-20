/** Русское склонение по числу: pluralRu(42, ['объект', 'объекта', 'объектов']) → 'объекта'.
 * Правила: 1/21/31 → ед. ч., 2–4/22–24 → род. ед., 5–20/25–30/… → род. мн. */
export function pluralRu(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return forms[2];
  if (last === 1) return forms[0];
  if (last >= 2 && last <= 4) return forms[1];
  return forms[2];
}

export const objectsWord = (n: number, locale: 'ru' | 'tg' | 'en' = 'ru') => locale === 'en' ? n === 1 ? 'property' : 'properties' : locale === 'tg' ? 'объект' : pluralRu(n, ['объект', 'объекта', 'объектов']);
