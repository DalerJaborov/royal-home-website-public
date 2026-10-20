export function localeText(source: string, strings: Record<string, string>, values?: Record<string, string | number>): string {
  // Price formatters retain factual numbers; translate their fixed currency suffix.
  const direct = typeof strings[source] === 'string' ? strings[source] : undefined;
  const numericSuffix = /^(?:[\d\s.,]+) (с\.|м²)$/.exec(source)?.[1];
  const translated = (direct ?? (numericSuffix && typeof strings[numericSuffix] === 'string' ? source.slice(0, -numericSuffix.length) + strings[numericSuffix] : source)).replace(/Royal Home(?: TJ)?/gi, 'ROYAL HOME');
  return values ? translated.replace(/\{(\w+)\}/g, (token, key: string) => {
    if (values[key] === undefined) return token;
    const value = String(values[key]);
    return typeof strings[value] === 'string' ? strings[value] : value;
  }) : translated;
}

/** Localize a display-only record; application enums and API values stay untouched. */
export function translateDisplayStrings<T>(value: T, translate: (source: string) => string): T {
  if (typeof value === 'string') return translate(value) as T;
  if (Array.isArray(value)) return value.map(item => translateDisplayStrings(item, translate)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, translateDisplayStrings(item, translate)])) as T;
  }
  return value;
}
