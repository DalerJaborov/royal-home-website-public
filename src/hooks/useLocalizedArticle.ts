import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { articleTranslationPath, articleTranslationSource, type ArticleTranslationSource, type PublicLocale } from '@contracts/public-i18n';
import versions from '@contracts/public-locale-versions.json';
import { useLocale } from '@/hooks/useLocale';
import { validArticleTranslation } from '@/lib/articleTranslation';

/** A stale resource never overlays newer factual article content. */
export function useLocalizedArticle<T extends ArticleTranslationSource & { supportedLocales?: PublicLocale[] }>(source: T | undefined) {
  const { locale } = useLocale();
  const revision = useMemo(() => source ? articleTranslationSource(source) : '', [source]);
  const enabled = locale !== 'ru' && !!source && (!source.supportedLocales || source.supportedLocales.includes(locale));
  const query = useQuery({
    queryKey: ['article-translation', locale, source?.id, revision],
    enabled,
    staleTime: 5 * 60_000,
    retry: 1,
    queryFn: async ({ signal }) => {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(revision));
      const hash = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
      const resourceVersions = versions.articles as Partial<Record<PublicLocale, Record<string, string>>>;
      const version = `${resourceVersions[locale]?.[String(source!.id)] ?? 'runtime'}-${hash}`;
      const controller = new AbortController();
      const abort = () => controller.abort();
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) controller.abort();
      const timeout = setTimeout(abort, 12_000);
      try {
        const response = await fetch(`${articleTranslationPath(locale, source!.id)}?v=${encodeURIComponent(version)}`, { signal: controller.signal });
        if (!response.ok) throw new Error('Article translation unavailable');
        const value: unknown = await response.json();
        if (!validArticleTranslation(value, hash)) throw new Error('Article translation does not match this revision');
        return value;
      } finally {
        clearTimeout(timeout);
        signal.removeEventListener('abort', abort);
      }
    },
  });
  const article = !source ? undefined : locale === 'ru' ? source : query.data ? { ...source, ...query.data } as T : undefined;
  return { article, loading: enabled && query.isPending, error: locale !== 'ru' && query.isError, retry: query.refetch };
}
