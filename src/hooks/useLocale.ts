import { useContext } from 'react';
import { LocaleContext } from '@/contexts/localeState';

export function useLocale() { return useContext(LocaleContext); }
