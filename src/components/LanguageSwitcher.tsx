import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronDown, Globe } from 'lucide-react';
import { localizedPath, isPublicPageComplete, type PublicLocale } from '@contracts/public-i18n';
import coverage from '@contracts/public-locale-coverage.json';
import { useLocale } from '@/hooks/useLocale';
import { trpc } from '@/providers/trpc';
import { useCms } from '@/contexts/CmsContext';
import { legacyArticleRevision } from '@contracts/legacy-article-i18n';

const LABELS: Record<PublicLocale, string> = { ru: 'Русский', tg: 'Тоҷикӣ', en: 'English' };
export default function LanguageSwitcher({ onSelect, compact = false }: { onSelect?: () => void; compact?: boolean }) {
  const { locale, basePath, text: tx } = useLocale();
  const { cms } = useCms();
  const { search, hash } = useLocation();
  const navigate = useNavigate();
  const slug = /^\/blog\/([^/]+)$/.exec(basePath)?.[1];
  const dynamicArticle = !!slug && !/^\d+$/.test(slug);
  const legacyId = slug && /^\d+$/.test(slug) ? Number(slug) : 0;
  const legacyArticle = Number.isSafeInteger(legacyId) && legacyId > 0;
  const legacySource = cms.blogPosts.find(post => post.id === legacyId && post.active !== false);
  const revision = legacySource ? legacyArticleRevision(legacySource) : undefined;
  const { data: article } = trpc.blog.getBySlug.useQuery({ slug: slug ?? '' }, { enabled: dynamicArticle, staleTime: 60_000 });
  const { data: legacy } = trpc.cms.legacyArticleLocales.useQuery({ id: legacyId, revision }, { enabled: legacyArticle, staleTime: 60_000 });
  const supported = ['ru', 'tg', 'en'].filter(language => {
    if (language === 'ru') return true;
    const pages = coverage[language as 'tg' | 'en'] as string[];
    if (dynamicArticle) return pages.includes('/blog') && article?.supportedLocales?.includes(language as PublicLocale);
    if (legacyArticle) return revision === legacy?.revision && legacy?.supportedLocales?.includes(language as PublicLocale);
    return isPublicPageComplete(basePath, pages);
  }) as PublicLocale[];
  if (supported.length < 2) return null;
  return (
    <nav aria-label={tx('Язык сайта')} className="inline-flex max-w-full shrink-0">
      <div className="relative max-w-full">
        <Globe aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-800" />
        <select
          aria-label={tx('Язык сайта')}
          value={locale}
          onChange={event => {
            navigate(localizedPath(`${basePath}${search}${hash}`, event.target.value as PublicLocale));
            onSelect?.();
          }}
          className={`max-w-full appearance-none rounded-xl border border-gray-200 bg-gray-50 pl-9 pr-8 font-medium text-gray-800 transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-800/40 ${compact ? 'min-h-9 py-2 text-xs' : 'min-h-11 py-2.5 text-sm'}`}
        >
          {supported.map(language => <option key={language} value={language} lang={language}>{LABELS[language]}</option>)}
        </select>
        <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500" />
      </div>
    </nav>
  );
}
