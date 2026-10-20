import { useCallback, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { localizedPath, resolvePublicPath, type PublicLocaleDictionary } from '@contracts/public-i18n';
import { localeText } from '@/lib/localeText';
import { dictionarySnapshot, emptyDictionary, preloadLocaleDictionary, retryDictionary, subscribeDictionaries } from '@/lib/localeDictionaries';
import { LocaleContext, type LocaleValue } from './localeState';

/** Dictionaries are requested only for their language; Russian ships no extra payload. */
export function LocaleProvider({ children, serverDictionary }: { children: ReactNode; serverDictionary?: PublicLocaleDictionary }) {
  const { pathname } = useLocation();
  const { locale, basePath } = resolvePublicPath(pathname);
  const snapshot = useCallback(() => dictionarySnapshot(locale), [locale]);
  const serverState = useMemo(() => serverDictionary ? { status: 'ready' as const, dictionary: serverDictionary } : undefined, [serverDictionary]);
  const serverSnapshot = useCallback(() => serverState ?? snapshot(), [serverState, snapshot]);
  const state = useSyncExternalStore(subscribeDictionaries, snapshot, serverSnapshot);
  useEffect(() => { void preloadLocaleDictionary(locale); }, [locale]);
  const value = useMemo<LocaleValue>(() => ({
    locale, basePath,
    loading: state.status === 'loading',
    error: state.status === 'error',
    dictionary: state.dictionary,
    text: (source, values) => localeText(source, locale === 'ru' ? emptyDictionary.strings : state.dictionary.strings, values),
    path: source => localizedPath(source, locale),
    retry: () => { void retryDictionary(locale); },
  }), [locale, basePath, state]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}
