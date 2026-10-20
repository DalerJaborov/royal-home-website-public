import { useLocale } from '@/hooks/useLocale';
import { ARTICLE_FINANCE_NOTE, isFinancialArticle } from '@contracts/article-finance-note';
import { articleCoverCredit } from '@contracts/article-cover-credits';
import { historicalArticleMediaDisclosure, HISTORICAL_COVER_NOTE, HISTORICAL_BODY_IMAGES_NOTE } from '@contracts/article-media-disclosure';
import { useEffect, useMemo, useRef } from 'react';
import { Link } from '@/components/LocalizedLink';
import { motion } from 'framer-motion';
import { Calendar, ChevronLeft, UserRound, RefreshCw, Clock, Tag } from 'lucide-react';
import { trpc } from '@/providers/trpc';
import { useSeo, SITE_ORIGIN } from '../hooks/useSeo';
import ArticleShare from '@/components/ArticleShare';
import { useLocalizedArticle } from '@/hooks/useLocalizedArticle';
import { Link as LanguageLink } from 'react-router-dom';
import { localizeArticleLinks } from '@contracts/article-links';
import { recordRenderedBlogVisit } from '@/lib/leadAttribution';
import { useAdminAuth } from '@/contexts/AdminAuthContext';

/**
 * Статья из таблицы articles (ИИ-генератор блога) — URL /blog/:slug.
 * Числовые URL /blog/:id остаются за старыми cms-статьями (BlogArticlePage
 * делегирует сюда, когда параметр не число).
 */
export default function BlogDbArticle({ slug }: { slug: string }) {
  const { text: tx, locale, path, dictionary } = useLocale();
  const { data: sourceArticle, isLoading, error } = trpc.blog.getBySlug.useQuery({ slug });
  const translated = useLocalizedArticle(sourceArticle ?? undefined);
  const article = translated.article;
  const { isAdmin, isLoading: authLoading } = useAdminAuth();
  useEffect(() => {
    recordRenderedBlogVisit(path(`/blog/${slug}`), sourceArticle ? { identity: sourceArticle.slug, published: sourceArticle.status === 'published' } : undefined,
      !authLoading && !isAdmin && !isLoading && !error && !translated.loading && !translated.error && !!article && article.id === sourceArticle?.id);
  }, [path, slug, sourceArticle, authLoading, isAdmin, isLoading, error, translated.loading, translated.error, article]);
  const renderedBody = useMemo(() => article ? localizeArticleLinks(article.contentHtml, locale, dictionary.completedPages, {
    unavailableListingIds: sourceArticle?.unavailableListingIds,
    unavailable: tx('Объявление больше недоступно'),
    catalog: tx('Актуальные предложения в каталоге'),
  }) : '', [article, locale, dictionary.completedPages, sourceArticle?.unavailableListingIds, tx]);
  // Keep this object stable: replacing innerHTML on an unrelated render removes
  // the table scroll wrappers, although the article text has not changed.
  const bodyMarkup = useMemo(() => ({ __html: renderedBody }), [renderedBody]);

  const articleUrl = `${SITE_ORIGIN}${path(`/blog/${slug}`)}`;
  const jsonLd: object[] = [];
  if (article) {
    jsonLd.push({
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: article.title,
      description: article.metaDescription || article.excerpt || undefined,
      ...(article.coverImageUrl ? { image: article.coverImageUrl } : {}),
      url: articleUrl,
      mainEntityOfPage: articleUrl,
      ...(article.publishedAt ? { datePublished: new Date(article.publishedAt).toISOString() } : {}),
      // dateModified — сигнал свежести: цифры в статьях пересчитываются раз в
      // квартал (refreshStaleArticles), и поиск должен об этом знать.
      ...(article.updatedAt ? { dateModified: new Date(article.updatedAt).toISOString() } : {}),
      author: { '@type': 'Organization', name: 'ROYAL HOME' },
      publisher: { '@type': 'Organization', name: 'ROYAL HOME', '@id': `${SITE_ORIGIN}/#organization` },
    });
    jsonLd.push({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Главная', item: SITE_ORIGIN },
        { '@type': 'ListItem', position: 2, name: 'Блог', item: `${SITE_ORIGIN}/blog` },
        { '@type': 'ListItem', position: 3, name: article.title, item: articleUrl },
      ],
    });
    if (article.faq?.length) {
      jsonLd.push({
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: article.faq.map((f) => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a },
        })),
      });
    }
  }

  useSeo({
    title: article ? article.metaTitle?.trim() || `${article.title} | Блог Royal Home` : 'Статья | Блог Royal Home',
    description: article?.metaDescription || article?.excerpt || undefined,
    image: article?.coverImageUrl || undefined,
    path: `/blog/${slug}`,
    type: 'article',
    pending: isLoading || translated.loading,
    noindex: (!isLoading && !translated.loading && !article) || translated.error,
    availableLocales: sourceArticle?.supportedLocales,
    jsonLd: jsonLd.length ? jsonLd : null,
  });

  // Таблицы из текста статьи оборачиваем в прокручиваемый контейнер: на телефоне
  // сравнение районов в четыре колонки шире экрана. Делаем это здесь, а не в
  // разметке статьи, чтобы правило действовало и для статей, вышедших раньше.
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = bodyRef.current;
    if (!root) return;
    for (const table of root.querySelectorAll("table")) {
      if (table.parentElement?.classList.contains("article-table")) continue;
      const wrap = document.createElement("div");
      wrap.className = "article-table";
      table.parentElement?.insertBefore(wrap, table);
      wrap.appendChild(table);
    }
  }, [renderedBody]);

  if (isLoading || translated.loading) {
    return <div className="pt-32 pb-16 min-h-screen text-center text-gray-500" role="status">{tx("Загрузка статьи…")}</div>;
  }
  if (locale !== 'ru' && sourceArticle && (!article || translated.error)) {
    return <div className="pt-32 pb-16 min-h-screen text-center section-padding">
      <h1 className="text-xl font-semibold mb-4">{tx('Перевод статьи пока недоступен')}</h1>
      <button onClick={() => { void translated.retry(); }} className="rounded-xl px-4 py-3 bg-emerald-800 text-white">{tx('Повторить загрузку')}</button>
      <LanguageLink to={`/blog/${slug}`} lang="ru" className="block mt-4 text-emerald-800 underline">{tx('Читать статью на русском')}</LanguageLink>
    </div>;
  }
  if (error || !article) {
    return (
      <div className="pt-32 pb-16 text-center">
        <p className="text-gray-500 mb-4">{tx("Статья не найдена")}</p>
        <Link to="/blog" className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-100 text-sm font-medium text-gray-700 hover:bg-gray-200 transition-colors">
          <ChevronLeft className="w-4 h-4" />  {tx("Назад к блогу")} </Link>
      </div>
    );
  }

  // Время чтения считаем по тексту, а не пишем «5 мин» константой, как раньше
  // стояло у старых статей: 170 слов в минуту — средняя скорость чтения на русском.
  const words = article.contentHtml.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
  const readingMinutes = Math.max(2, Math.round(words / 170));
  const dateLocale = locale === 'tg' ? 'tg-TJ' : locale === 'en' ? 'en-GB' : 'ru-RU';
  const dateStr = article.publishedAt ? new Date(article.publishedAt).toLocaleDateString(dateLocale) : null;
  // Дата относится к последнему изменению статьи, включая обложку:
  // она не утверждает, что рыночные или банковские условия были проверены.
  // Сутки разницы — порог: сохранение сразу после публикации обновлением не считается.
  const published = article.publishedAt ? new Date(article.publishedAt).getTime() : 0;
  const updated = article.updatedAt ? new Date(article.updatedAt).getTime() : 0;
  const updatedStr =
    published && updated - published > 24 * 60 * 60 * 1000
      ? new Date(article.updatedAt).toLocaleDateString(dateLocale)
      : null;
  const coverCredit = articleCoverCredit(article.id, article.coverImageUrl);
  const mediaDisclosure = historicalArticleMediaDisclosure({ id: article.id, coverImageUrl: article.coverImageUrl, sourceHash: sourceArticle?.translationSourceHash });

  return (
    <div className="pt-20 pb-16 min-h-screen bg-white">
      <div className="section-padding">
        {/* Хлебные крошки: человеку — где он находится, поиску — BreadcrumbList
            в разметке (Google рисует такую цепочку прямо в выдаче). */}
        <nav className="max-w-3xl mx-auto mb-3 text-xs text-gray-400 flex items-center gap-1.5 flex-wrap" aria-label={tx("Хлебные крошки")}>
          <Link to="/" className="hover:text-gray-600">{tx("Главная")}</Link>
          <span>/</span>
          <Link to="/blog" className="hover:text-gray-600">{tx("Блог")}</Link>
          {article.category && (<><span>/</span><span className="flex items-center gap-1"><Tag className="w-3 h-3" />{tx(article.category)}</span></>)}
        </nav>

        <div className="max-w-3xl mx-auto mb-3">
          <Link to="/blog" className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-100 text-sm font-medium text-gray-700 hover:bg-gray-200 transition-colors">
            <ChevronLeft className="w-4 h-4" />  {tx("Назад к блогу")} </Link>
        </div>

        {/* Hero: обложка, а без неё — фирменный градиент (у ИИ-статей фото нет) */}
        <div className="max-w-3xl mx-auto relative h-64 sm:h-72 lg:h-80 rounded-3xl overflow-hidden">
          {article.coverImageUrl ? (
            <img src={article.coverImageUrl} alt={tx(article.title)} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-emerald-900 via-emerald-800 to-emerald-950" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-7">
            <span className="px-3 py-1 rounded-lg text-xs font-bold bg-emerald-700 text-white mb-3 inline-block">
              {tx(article.category || 'Статья')}
            </span>
            <motion.h1
              className="text-xl sm:text-2xl lg:text-3xl font-bold text-white mb-2 max-w-2xl leading-snug"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              {tx(article.title)}
            </motion.h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-white/70 text-sm [&>span]:whitespace-nowrap">
              {dateStr && <span className="flex items-center gap-1"><Calendar className="w-4 h-4" /> {tx(dateStr)}</span>}
              <span className="flex items-center gap-1"><Clock className="w-4 h-4" /> {readingMinutes}  {tx("мин чтения")}</span>
              <span className="flex items-center gap-1"><UserRound className="w-4 h-4" />  {tx("Редакция Royal Home")}</span>
              {updatedStr && (
                <span className="flex items-center gap-1" title={tx('Дата последнего изменения статьи')}>
                  <RefreshCw className="w-4 h-4" />  {tx("Обновлено")} {tx(updatedStr)}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="section-padding py-8">
        <motion.div className="max-w-3xl mx-auto" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          {mediaDisclosure?.cover && <p className="text-sm text-gray-600 mb-5">{tx(HISTORICAL_COVER_NOTE)}</p>}
          {coverCredit && <p className="text-sm text-gray-600 mb-5">{tx('Фото объекта из каталога')} · <Link to={`/listing/${coverCredit.listingId}`} className="underline underline-offset-4">{tx('Смотреть объект →')}</Link></p>}
          {article.excerpt && (
            <p className="text-lg text-gray-700 font-medium mb-6 leading-relaxed">{tx(article.excerpt)}</p>
          )}
          {isFinancialArticle(article.title, article.category) && <p className="bg-[#edf1eb] p-4 text-sm leading-relaxed text-gray-700 mb-6">{tx(ARTICLE_FINANCE_NOTE)}</p>}
          {mediaDisclosure?.body && <p className="text-sm leading-relaxed text-gray-600 mb-6">{tx(HISTORICAL_BODY_IMAGES_NOTE)}</p>}

          {/* contentHtml санитизирован на сервере перед сохранением (api/lib/sanitize-html.ts) */}
          <div
            ref={bodyRef}
            className="article-body prose prose-sm max-w-none text-gray-600 leading-relaxed [&_.article-table]:max-w-full [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-gray-900 [&_h2]:mt-8 [&_h2]:mb-3 [&_h3]:text-lg [&_h3]:font-bold [&_h3]:text-gray-900 [&_h3]:mt-6 [&_h3]:mb-3 [&_p]:mb-4 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-4 [&_li]:mb-1"
            dangerouslySetInnerHTML={bodyMarkup}
          />

          {/* FAQ — рендерим и на странице, и в JSON-LD FAQPage (см. useSeo выше) */}
          {article.faq && article.faq.length > 0 && (
            <div className="mt-10">
              <h2 className="text-xl font-bold text-gray-900 mb-4">{tx("Частые вопросы")}</h2>
              <div className="space-y-3">
                {article.faq.map((f, i) => (
                  <details key={i} className="group rounded-2xl bg-gray-50 border border-gray-100 p-4">
                    <summary className="font-semibold text-gray-900 cursor-pointer list-none flex items-center justify-between">
                      {tx(f.q)}
                      <span className="text-gray-400 group-open:rotate-45 transition-transform text-lg leading-none ml-3">+</span>
                    </summary>
                    <p className="text-sm text-gray-600 mt-3 leading-relaxed">{tx(f.a)}</p>
                  </details>
                ))}
              </div>
            </div>
          )}

          <ArticleShare title={tx(article.title)} />

          {/* CTA — как на страницах старых статей */}
          <div className="mt-10 p-6 rounded-2xl bg-gray-50 border border-gray-100 text-center">
            <h4 className="text-lg font-bold text-gray-900 mb-2">{tx("Ищете квартиру в Душанбе?")}</h4>
            <p className="text-sm text-gray-500 mb-4">{tx("Наши риелторы подберут для вас лучшие варианты")}</p>
            <Link to="/listings" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-white font-semibold" style={{ backgroundColor: '#1a4d3a' }}>
               {tx("Смотреть объекты")} </Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
