import { useSeo } from './useSeo';

/**
 * Тонкая обёртка над useSeo для обратной совместимости — раньше ставила только
 * title + description. Теперь через useSeo подтягивает и og/twitter/canonical.
 * Новый код используйте useSeo напрямую (он умеет image/jsonLd/path/type).
 */
export function useDocumentSeo(title: string, description?: string) {
  useSeo({ title, description });
}
