import { useLocale } from '@/hooks/useLocale';
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Calendar, ArrowRight } from 'lucide-react';
import { Link } from '@/components/LocalizedLink';
import { useCms } from '../contexts/CmsContext';
import { useDocumentSeo } from '../hooks/useDocumentSeo';
import type { Translations } from '../data/translations';
import { trpc } from '@/providers/trpc';
import { Link as LanguageLink } from 'react-router-dom';
import { legacyArticleTranslated } from '@/lib/legacyArticleTranslation';

const CATEGORIES = ['Все', 'Аналитика', 'Покупка', 'Продажа', 'Ипотека', 'Инвестиции', 'Юридические вопросы', 'Ремонт', 'Районы'];

/** Шесть карточек — два ровных ряда по три на широком экране. */
const PAGE_SIZE = 6;

/** Карточка списка: общий вид для статьи из cms и статьи генератора. */
interface BlogCard {
  key: string;
  href: string;
  title: string;
  excerpt: string;
  image: string | null;
  category: string;
  dateLabel: string;
  /** Метка времени для общей сортировки: у cms дата хранится строкой «дд.мм.гггг». */
  time: number;
  localized: boolean;
}

function parseRuDate(date: string): number {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(date.trim());
  if (!m) return 0;
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])).getTime();
}

export default function BlogPage({ t }: { t: Translations }) {
  const { text: tx, locale, dictionary } = useLocale();
  const { cms } = useCms();
  useDocumentSeo(cms.site.pageSeo.blog.title, cms.site.pageSeo.blog.description);
  const [category, setCategory] = useState('Все');
  const [page, setPage] = useState(1);

  // Статьи приходят из двух хранилищ: старые лежат в cms, новые пишет генератор
  // в таблицу articles. Для читателя это одни и те же статьи, поэтому дальше они
  // сведены в ОДИН список — с общей сортировкой по дате и общей пагинацией.
  // Рубрика статей генератора — «Аналитика».
  const { data: dbArticles } = trpc.blog.list.useQuery({ page: 1, pageSize: 50, locale });

  const ALL_POSTS: BlogCard[] = useMemo(() => {
    const fromCms: BlogCard[] = cms.blogPosts
      .filter(p => p.active)
      .map(p => ({
        key: `cms-${p.id}`,
        href: `/blog/${p.id}`,
        title: p.title,
        excerpt: p.excerpt,
        image: p.image || null,
        category: p.category,
        dateLabel: p.date,
        time: parseRuDate(p.date),
        localized: locale === 'ru' || legacyArticleTranslated(p, dictionary.strings),
      }));
    const fromDb: BlogCard[] = (dbArticles?.items ?? []).map(a => ({
      key: `db-${a.id}`,
      href: `/blog/${a.slug}`,
      title: a.title,
      excerpt: a.excerpt ?? '',
      image: a.coverImageUrl ?? null,
      category: a.category || 'Аналитика',
      dateLabel: new Date(a.publishedAt ?? a.createdAt).toLocaleDateString('ru-RU'),
      time: new Date(a.publishedAt ?? a.createdAt).getTime(),
      localized: locale === 'ru' || a.translationAvailable,
    }));
    return [...fromCms, ...fromDb].sort((a, b) => b.time - a.time);
  }, [cms.blogPosts, dbArticles, locale, dictionary]);

  const FILTERED = category === 'Все' ? ALL_POSTS : ALL_POSTS.filter(p => p.category === category);
  const totalPages = Math.max(1, Math.ceil(FILTERED.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const VISIBLE = FILTERED.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const goToPage = (next: number) => {
    setPage(next);
    // Иначе после переключения страницы читатель остаётся внизу списка и видит
    // конец новой страницы вместо её начала.
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  return (
    <div className="pt-20 pb-16 lg:pb-4 min-h-screen bg-white">
      <div className="section-padding">
        {/* Hero — светлая шапка в едином стиле с остальными страницами */}
        <motion.div
          className="text-center mb-10 pt-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h1 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-3">{tx(t.blog.title)}</h1>
          <p className="text-gray-500 max-w-2xl mx-auto px-4">
             {tx("Полезные статьи о недвижимости в Душанбе: советы по покупке, ипотеке, ремонту и инвестициям")} </p>
        </motion.div>

        {/* Categories — working filter */}
        <div className="flex flex-wrap justify-center gap-2 mb-10">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => { setCategory(cat); setPage(1); }}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                category === cat ? 'text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
              style={category === cat ? { backgroundColor: '#1a4d3a' } : {}}
            >
              {tx(cat)}
            </button>
          ))}
        </div>

        {/* Posts grid — the whole card (photo included) opens the article */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {VISIBLE.map((post, i) => {
            const CardLink = post.localized ? Link : LanguageLink;
            return (
            <motion.article
              key={post.key}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
            >
              <CardLink
                to={post.href}
                className="block bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-lg transition-all group h-full"
              >
                <div className="aspect-[16/10] overflow-hidden bg-gray-100">
                  {post.image ? (
                    <img
                      src={post.image}
                      alt={post.localized ? tx(post.title) : post.title}
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                    />
                  ) : (
                    /* Без обложки — фирменный градиент вместо серой заглушки */
                    <div className="w-full h-full bg-gradient-to-br from-emerald-900 via-emerald-700 to-emerald-950 flex items-center justify-center">
                      <span className="text-emerald-200/60 font-bold text-lg tracking-wide">ROYAL HOME</span>
                    </div>
                  )}
                </div>
                <div className="p-5">
                  <div className="flex items-center gap-2 mb-3">
                    {!post.localized && <span lang="ru" aria-label={tx('Читать статью на русском')} className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">Русский</span>}
                    <span className="px-2.5 py-0.5 rounded-md text-[11px] font-medium bg-emerald-50 text-emerald-800">
                      {tx(post.category)}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-gray-400">
                      <Calendar className="w-3 h-3" /> {tx(post.dateLabel)}
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-gray-900 mb-2 line-clamp-2 leading-snug group-hover:text-emerald-800 transition-colors">
                    <span lang={post.localized ? locale : 'ru'}>{post.localized ? tx(post.title) : post.title}</span>
                  </h3>
                  <p lang={post.localized ? locale : 'ru'} className="text-sm text-gray-500 line-clamp-3 mb-4">{post.localized ? tx(post.excerpt) : post.excerpt}</p>
                  <span
                    className="inline-flex items-center gap-1 text-sm font-semibold transition-all group-hover:gap-2"
                    style={{ color: '#1a4d3a' }}
                  >
                    {tx(t.blog.readMore)} <ArrowRight className="w-4 h-4" />
                  </span>
                </div>
              </CardLink>
            </motion.article>
            );
          })}
        </div>

        {FILTERED.length === 0 && (
          <p className="text-center text-gray-400 py-12">{tx("В этой рубрике пока нет статей")}</p>
        )}

        {/* Пагинация: список растёт сам — генератор пишет статью каждую неделю,
            и без неё страница со временем стала бы бесконечной лентой. */}
        {totalPages > 1 && (
          <nav className="flex items-center justify-center gap-2 mt-12" aria-label={tx("Страницы блога")}>
            <button
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage === 1}
              className="px-4 py-2 rounded-xl text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-40 transition-all"
            >
               {tx("Назад")} </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                onClick={() => goToPage(n)}
                aria-current={n === currentPage ? 'page' : undefined}
                className={`w-10 h-10 rounded-xl text-sm font-medium transition-all ${
                  n === currentPage ? 'text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
                style={n === currentPage ? { backgroundColor: '#1a4d3a' } : {}}
              >
                {n}
              </button>
            ))}
            <button
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="px-4 py-2 rounded-xl text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-40 transition-all"
            >
               {tx("Вперёд")} </button>
          </nav>
        )}

      </div>
    </div>
  );
}
