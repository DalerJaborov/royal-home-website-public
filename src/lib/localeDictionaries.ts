import type { PublicLocale, PublicLocaleDictionary } from '@contracts/public-i18n';
import versions from '@contracts/public-locale-versions.json';

export type DictionaryState = { status: 'loading' | 'ready' | 'error'; dictionary: PublicLocaleDictionary };
export const emptyDictionary: PublicLocaleDictionary = { strings: {} };
const pendingState: DictionaryState = { status: 'loading', dictionary: emptyDictionary };
const dictionaries = new Map<PublicLocale, DictionaryState>([['ru', { status: 'ready', dictionary: emptyDictionary }]]);
const requests = new Map<PublicLocale, Promise<void>>();
const subscribers = new Set<() => void>();
export function subscribeDictionaries(callback: () => void) {
  subscribers.add(callback);
  return () => { subscribers.delete(callback); };
}
export function dictionarySnapshot(locale: PublicLocale) { return dictionaries.get(locale) ?? pendingState; }
export function retryDictionary(locale: PublicLocale) {
  dictionaries.delete(locale);
  subscribers.forEach(callback => callback());
  return preloadLocaleDictionary(locale);
}

/** Shared by bootstrap and provider; Russian requires no additional request. */
export function preloadLocaleDictionary(locale: PublicLocale): Promise<void> {
  if (dictionaries.get(locale)?.status === 'ready') return Promise.resolve();
  const pending = requests.get(locale);
  if (pending) return pending;
  const version = (versions.dictionaries as Partial<Record<PublicLocale, string>>)[locale] ?? '1';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  const request = fetch(`/locales/${locale}.json?v=${encodeURIComponent(version)}`, { credentials: 'same-origin', signal: controller.signal })
    .then(async response => {
      if (!response.ok) throw new Error(`Dictionary unavailable: ${response.status}`);
      const value: unknown = await response.json();
      if (!value || typeof value !== 'object' || !('strings' in value) || !value.strings || typeof value.strings !== 'object') throw new Error('Invalid dictionary');
      const strings: Record<string, string> = {};
      for (const [source, translated] of Object.entries(value.strings)) if (typeof translated === 'string') strings[source] = translated;
      const input = value as PublicLocaleDictionary;
      const pages = Object.fromEntries(Object.entries(input.pages ?? {}).filter(([, page]) => page && typeof page.title === 'string' && typeof page.description === 'string'));
      const completedPages = Array.isArray(input.completedPages) ? input.completedPages.filter(page => typeof page === 'string') : [];
      dictionaries.set(locale, { status: 'ready', dictionary: { strings, pages, completedPages, cms: input.cms && typeof input.cms === 'object' ? input.cms : undefined } });
    })
    .catch(() => { dictionaries.set(locale, { status: 'error', dictionary: emptyDictionary }); })
    .finally(() => {
      clearTimeout(timeout);
      requests.delete(locale);
      subscribers.forEach(callback => callback());
    });
  requests.set(locale, request);
  return request;
}
