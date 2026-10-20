import { createContext } from 'react';
import type { PublicLocale, PublicLocaleDictionary } from '@contracts/public-i18n';
import { localeText } from '@/lib/localeText';

export interface LocaleValue {
  locale: PublicLocale;
  basePath: string;
  loading: boolean;
  error: boolean;
  dictionary: PublicLocaleDictionary;
  text: (source: string, values?: Record<string, string | number>) => string;
  path: (basePath: string) => string;
  retry: () => void;
}
export const LocaleContext = createContext<LocaleValue>({ locale: 'ru', basePath: '/', loading: false, error: false, dictionary: { strings: {} }, text: (source, values) => localeText(source, {}, values), path: source => source, retry: () => {} });
