import { useLocale } from '@/hooks/useLocale';
import { ARTICLE_FINANCE_NOTE, isFinancialArticle } from '@contracts/article-finance-note';
import { useParams } from 'react-router-dom';
import { Link } from '@/components/LocalizedLink';
import { motion } from 'framer-motion';
import { Calendar, ChevronLeft, Clock, ArrowRight } from 'lucide-react';
import { useCms } from '../contexts/CmsContext';
import { useSeo, SITE_ORIGIN } from '../hooks/useSeo';
import BlogDbArticle from './BlogDbArticle';
import { Link as LanguageLink } from 'react-router-dom';
import { legacyArticleTranslated } from '@/lib/legacyArticleTranslation';
import { legacyArticleRevision } from '@contracts/legacy-article-i18n';
import { trpc } from '@/providers/trpc';
import { useEffect } from 'react';
import { recordRenderedBlogVisit } from '@/lib/leadAttribution';
import { useAdminAuth } from '@/contexts/AdminAuthContext';

export default function BlogArticlePage() {
  const { id } = useParams();
  // Не-числовой параметр — это slug статьи из таблицы articles (ИИ-генератор),
  // числовой — старая cms-статья. Один роут /blog/:id обслуживает оба мира.
  if (id && !/^\d+$/.test(id)) {
    return <BlogDbArticle slug={id} />;
  }
  return <CmsBlogArticle id={id} />;
}

function CmsBlogArticle({ id }: { id: string | undefined }) {
  const { text: tx, path, locale, dictionary } = useLocale();
  const { cms } = useCms();
  const BLOG_POSTS = cms.blogPosts.filter(p => p.active);
  const post = BLOG_POSTS.find(p => p.id === Number(id));
  const localizedReady = locale === 'ru' || (!!post && legacyArticleTranslated(post, dictionary.strings));
  const revision = post ? legacyArticleRevision(post) : undefined;
  const { data: publication } = trpc.cms.legacyArticleLocales.useQuery({ id: Number(id), revision }, { enabled: !!post, staleTime: 60_000 });
  const { isAdmin, isLoading: authLoading } = useAdminAuth();
  useEffect(() => {
    recordRenderedBlogVisit(path(`/blog/${id}`), post ? { identity: String(post.id), published: post.active } : undefined,
      !authLoading && !isAdmin && localizedReady && !!publication && publication.revision === revision && publication.supportedLocales.includes(locale));
  }, [path, id, post, authLoading, isAdmin, localizedReady, publication, revision, locale]);

  const articleUrl = `${SITE_ORIGIN}${path(`/blog/${id}`)}`;
  useSeo({
    title: post ? `${tx(post.title)} | ${tx('Блог')} ROYAL HOME` : 'Статья | Блог ROYAL HOME',
    description: post?.excerpt ? tx(post.excerpt) : undefined,
    image: post?.image,
    path: `/blog/${id}`,
    type: 'article',
    noindex: !post || !localizedReady,
    availableLocales: publication && publication.revision === revision ? publication.supportedLocales : ['ru'],
    jsonLd: post
      ? {
          '@context': 'https://schema.org',
          '@type': 'Article',
          headline: post.title,
          description: post.excerpt,
          image: post.image?.startsWith('http') ? post.image : `${SITE_ORIGIN}${post.image}`,
          articleSection: post.category,
          url: articleUrl,
          mainEntityOfPage: articleUrl,
          publisher: { '@type': 'Organization', name: 'ROYAL HOME', '@id': `${SITE_ORIGIN}/#organization` },
        }
      : null,
  });

  if (!post) {
    return <div className="pt-32 text-center text-gray-500">{tx("Статья не найдена")}</div>;
  }
  if (!localizedReady) return <div className="pt-32 pb-16 min-h-screen section-padding text-center">
    <h1 className="text-xl font-semibold mb-4">{tx('Перевод статьи пока недоступен')}</h1>
    <LanguageLink to={`/blog/${id}`} lang="ru" className="text-emerald-800 underline">{tx('Читать статью на русском')}</LanguageLink>
  </div>;

  const related = BLOG_POSTS.filter(p => p.id !== Number(id) && p.category === post.category).slice(0, 3);
  // Admin-written article body (paragraphs split on blank lines). The
  // built-in guide below stays as a fallback for posts without real content.
  const hasRealContent = Boolean(post.content && post.content.trim().length > 120);

  return (
    <div className="pt-20 pb-16 min-h-screen bg-white">
      <div className="section-padding">
        <div className="max-w-3xl mx-auto mb-3">
          <Link to="/blog" className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-100 text-sm font-medium text-gray-700 hover:bg-gray-200 transition-colors">
            <ChevronLeft className="w-4 h-4" />  {tx("Назад к блогу")} </Link>
        </div>

        {/* Hero — contained rounded card, same visual language as other page
            heroes (was an edge-to-edge full-height band that felt oversized
            and out of step with the rest of the site). */}
        <div className="max-w-3xl mx-auto relative h-56 sm:h-72 lg:h-80 rounded-3xl overflow-hidden">
          <img src={post.image} alt={tx(post.title)} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-7">
            <span className="px-3 py-1 rounded-lg text-xs font-bold bg-emerald-700 text-white mb-3 inline-block">{tx(post.category)}</span>
            <motion.h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-white mb-2 max-w-2xl leading-snug" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>{tx(post.title)}</motion.h1>
            <div className="flex items-center gap-4 text-white/70 text-sm">
              <span className="flex items-center gap-1"><Calendar className="w-4 h-4" /> {tx(post.date)}</span>
              <span className="flex items-center gap-1"><Clock className="w-4 h-4" />  {tx("5 мин чтения")}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Article content — section-padding on the OUTER div and max-w-3xl on
          an inner one, exactly like the hero above. Having both classes on
          the same element (as before) double-applies the horizontal gutter:
          max-w-3xl caps the border-box at 768px, then section-padding's own
          padding eats into it, landing content ~48px inside the hero's edge
          instead of flush with it — the "not aligned" the owner flagged. */}
      <div className="section-padding py-8">
      <motion.div className="max-w-3xl mx-auto" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        {/* Excerpt */}
        <p className="text-lg text-gray-700 font-medium mb-6 leading-relaxed">{tx(post.excerpt)}</p>
        {isFinancialArticle(post.title, post.category) && <p className="bg-[#edf1eb] p-4 text-sm leading-relaxed text-gray-700 mb-6">{tx(ARTICLE_FINANCE_NOTE)}</p>}

        {/* Full article content */}
        {hasRealContent ? (
          <div className="prose prose-sm max-w-none text-gray-600 leading-relaxed space-y-4">
            {tx(post.content).split(/\n{2,}|\r\n{2,}/).map((para, i) =>
              para.startsWith('## ') ? (
                <h3 key={i} className="text-lg font-bold text-gray-900 mt-6 mb-3">{tx(para.slice(3))}</h3>
              ) : (
                <p key={i} className="whitespace-pre-line">{tx(para)}</p>
              )
            )}
          </div>
        ) : null}
        {/* Здесь лежала «встроенная статья» — пять разделов про покупку квартиры,
            которые подставлялись ЛЮБОЙ статье короче 120 символов. Статья про
            ипотеку показывала текст про выбор района, и так у всех сразу: один
            и тот же текст на разных адресах, то есть дубли контента на публичном
            сайте и обманутое ожидание читателя. Если полного текста нет — честно
            показываем только анонс, который автор написал сам. */}

        {/* CTA */}
        <div className="mt-10 p-6 rounded-2xl bg-gray-50 border border-gray-100 text-center">
          <h4 className="text-lg font-bold text-gray-900 mb-2">{tx("Ищете квартиру в Душанбе?")}</h4>
          <p className="text-sm text-gray-500 mb-4">{tx("Наши риелторы подберут для вас лучшие варианты")}</p>
          <Link to="/listings" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-white font-semibold" style={{ backgroundColor: '#1a4d3a' }}>{tx("Смотреть объекты")}</Link>
        </div>
      </motion.div>
      </div>

      {/* Related posts */}
      {related.length > 0 && (
        <div className="section-padding pb-12">
        <div className="max-w-3xl mx-auto">
          <h3 className="text-xl font-bold text-gray-900 mb-6">{tx("Похожие статьи")}</h3>
          <div className="space-y-4">
            {related.map(r => (
              <Link key={r.id} to={`/blog/${r.id}`} className="flex gap-4 p-4 rounded-2xl bg-gray-50 border border-gray-100 hover:shadow-md transition-all">
                <div className="w-24 h-16 rounded-xl overflow-hidden flex-shrink-0 bg-gray-200">
                  <img src={r.image} alt={tx(r.title)} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-[11px] font-medium text-emerald-700">{tx(r.category)}</span>
                  <h4 className="text-sm font-bold text-gray-900 line-clamp-2">{tx(r.title)}</h4>
                  <span className="text-xs text-gray-400 flex items-center gap-1 mt-1"><Calendar className="w-3 h-3" /> {tx(r.date)}</span>
                </div>
                <ArrowRight className="w-4 h-4 text-gray-300 flex-shrink-0 self-center" />
              </Link>
            ))}
          </div>
        </div>
        </div>
      )}
    </div>
  );
}
