import { listingTitle, listingLocation } from '@/lib/listingPresentation';
import { useLocale } from '@/hooks/useLocale';
import { useState, useMemo, useEffect, useLayoutEffect, useRef, useTransition } from 'react';
import { useSearchParams, useLocation, useNavigationType } from 'react-router-dom';
import { SortAsc, X, Search, SlidersHorizontal } from 'lucide-react';
import { objectsWord } from '../lib/plural';
import { useCms, CATEGORY_LABELS, type CategoryVisibility } from '../contexts/CmsContext';
import { useSeo } from '../hooks/useSeo';
import { catalogNeedsNoindex } from '@contracts/catalog-seo';
import type { Translations } from '../data/translations';
import { useListingsData } from '@/hooks/useListingsData';
import { matchesSearch } from '@/lib/searchTokens';
import ListingCard from '@/components/ListingCard';
import DistrictLinks from '@/components/DistrictLinks';
import CatalogBuyingGuide from '@/components/CatalogBuyingGuide';
import { readCatalogView, saveCatalogView, nextCatalogCount } from '@/lib/catalogView';
import { compareCatalogOrder } from '@contracts/catalog-order';
import { useBrowserCapability } from '@/hooks/useBrowserCapability';
import { PUBLIC_CATALOG_INTERACTIVE_EVENT } from '@/lib/homeSearch';
import { localizedPath } from '@contracts/public-i18n';
import { useMetaSearch } from '@/hooks/useMetaPixel';

const DISTRICTS = ['Все районы', 'Сино', 'Шохмансур', 'Фирдавси', 'И. Сомони'];
const ROOMS = ['Все', '1', '2', '3', '4+'];
const SORT_OPTIONS = ['Без сортировки', 'Цена — по возрастанию', 'Цена — по убыванию', 'Площадь — по возрастанию', 'Площадь — по убыванию', 'Сначала новые'];

export default function ListingsPage({ t }: { t: Translations }) {
  useEffect(() => {
    // Parent bootstrap effects may replace the lazy hydration boundary. Announce
    // readiness after those commits, and cancel a superseded route's signal.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => document.dispatchEvent(new Event(PUBLIC_CATALOG_INTERACTIVE_EVENT)));
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  const { text: tx, locale } = useLocale();
  const location = useLocation();
  const navigationType = useNavigationType();
  const supportsAutoLoading = useBrowserCapability(() => typeof IntersectionObserver !== 'undefined');
  const [savedView] = useState(() => readCatalogView(location.key));
  const sentinelRef = useRef<HTMLDivElement>(null);
  const restoredRef = useRef(false);
  const [isAppending, startAppend] = useTransition();
  const { listings: LISTINGS, isLoading, isError } = useListingsData();
  const { cms } = useCms();
  // Category chips only appear once a second category is enabled in the admin
  // (Настройки → Типы объектов) — with apartments alone there's nothing to filter.
  const visibleCategories = (Object.keys(CATEGORY_LABELS) as (keyof CategoryVisibility)[])
    .filter(k => cms.categoryVisibility[k]);
  const [searchParams, setSearchParams] = useSearchParams();
  useSeo({ title: cms.site.pageSeo.listings.title, description: cms.site.pageSeo.listings.description,
    path: '/listings', noindex: catalogNeedsNoindex(searchParams) });
  // Категория из адреса — сюда приходит выбор из поиска в шапке главной.
  const urlCategory = searchParams.get('category');
  const [filterCategory, setFilterCategory] = useState<'all' | keyof CategoryVisibility>(
    savedView?.category ?? (urlCategory && urlCategory in CATEGORY_LABELS ? (urlCategory as keyof CategoryVisibility) : 'all')
  );
  const [sortBy, setSortBy] = useState(savedView?.sort ?? 'Без сортировки');
  const [sortOpen, setSortOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const urlTab = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState<'all' | 'new' | 'secondary' | 'urgent'>(
    savedView?.tab ?? (urlTab === 'urgent' || urlTab === 'new' || urlTab === 'secondary' ? urlTab : 'all')
  );

  // Read URL filters
  const urlDistrict = searchParams.get('district') || '';
  const urlRooms = searchParams.get('rooms') || '';

  // Filter state
  const [filterDistrict, setFilterDistrict] = useState(savedView?.district ?? urlDistrict);
  const [filterRooms, setFilterRooms] = useState(savedView?.rooms ?? urlRooms);
  const [minPrice, setMinPrice] = useState(savedView?.minPrice ?? '');
  const [maxPrice, setMaxPrice] = useState(savedView?.maxPrice ?? '');
  const [minArea, setMinArea] = useState(savedView?.minArea ?? '');
  const [maxArea, setMaxArea] = useState(savedView?.maxArea ?? '');
  const [searchQuery, setSearchQuery] = useState(savedView?.query ?? searchParams.get('q') ?? '');

  const hasActiveFilters = Boolean(filterDistrict || filterRooms || minPrice || maxPrice || minArea || maxArea || searchQuery);

  // A filter change starts a fresh batch in the same render, without an effect
  // that first paints the previous filter's count and then renders again.
  const filterKey = JSON.stringify([activeTab, filterCategory, filterDistrict, filterRooms, minPrice, maxPrice, minArea, maxArea, searchQuery, sortBy]);
  const [batch, setBatch] = useState({ filterKey, count: savedView?.filterKey === filterKey ? savedView.count : 8 });
  const visibleCount = batch.filterKey === filterKey ? batch.count : 8;
  if (batch.filterKey !== filterKey) setBatch({ filterKey, count: 8 });

  // Apply all filters
  const displayed = useMemo(() => {
    const uniqueListings = [...new Map(LISTINGS.map(listing => [listing.id, listing])).values()];
    let result = activeTab === 'all'
      ? uniqueListings
      : activeTab === 'new'
        ? uniqueListings.filter(l => l.type === 'Новостройки')
        : activeTab === 'secondary'
          ? uniqueListings.filter(l => l.type === 'Вторичка')
          : uniqueListings.filter(l => l.urgent && !l.sold);

    // Category (CRM property type; site-native listings count as APARTMENT)
    if (filterCategory !== 'all') {
      result = result.filter(l => (l.category ?? 'APARTMENT') === filterCategory);
    }
    // District
    if (filterDistrict && filterDistrict !== 'Все районы') {
      result = result.filter(l => l.location.toLowerCase().includes(filterDistrict.toLowerCase()));
    }
    // Rooms
    if (filterRooms && filterRooms !== 'Все') {
      if (filterRooms === '4+') {
        result = result.filter(l => l.rooms >= 4);
      } else {
        const rooms = parseInt(filterRooms);
        if (!isNaN(rooms)) result = result.filter(l => l.rooms === rooms);
      }
    }
    // Price range
    if (minPrice) result = result.filter(l => l.price >= parseInt(minPrice) * 1000);
    if (maxPrice) result = result.filter(l => l.price <= parseInt(maxPrice) * 1000);
    // Area range
    if (minArea) result = result.filter(l => l.area >= parseInt(minArea));
    if (maxArea) result = result.filter(l => l.area <= parseInt(maxArea));
    // Text search — ищет по заголовку, адресу и описанию; устойчив к раскладке/
    // транслиту отдельных слов (см. src/lib/searchTokens.ts). Все слова запроса
    // должны найтись, порядок и регистр значения не имеют.
    if (searchQuery.trim()) {
      result = result.filter(l =>
        matchesSearch(
          `${l.title} ${l.location} ${l.description ?? ''} ${locale !== 'ru' ? `${listingTitle(l, locale, tx)} ${listingLocation(l, locale, tx)}` : ''}`.toLowerCase(),
          searchQuery
        )
      );
    }

    // Sort
    if (sortBy === 'Цена — по возрастанию') result.sort((a, b) => a.price - b.price);
    if (sortBy === 'Цена — по убыванию') result.sort((a, b) => b.price - a.price);
    if (sortBy === 'Площадь — по возрастанию') result.sort((a, b) => a.area - b.area);
    if (sortBy === 'Площадь — по убыванию') result.sort((a, b) => b.area - a.area);
    // Default view: новые объекты всегда выше старых — сортируем по id (растёт
    // строго по порядку создания, надёжнее свободного текстового поля date).
    // Проданные — в конце, чтобы не перекрывать активные объекты наверху.
    if (sortBy === 'Без сортировки') {
      result.sort(compareCatalogOrder);
    }

    return result;
  }, [LISTINGS, activeTab, filterCategory, filterDistrict, filterRooms, minPrice, maxPrice, minArea, maxArea, searchQuery, sortBy, locale, tx]);

  const clearFilters = () => {
    setFilterCategory('all');
    setFilterDistrict('');
    setFilterRooms('');
    setMinPrice('');
    setMaxPrice('');
    setMinArea('');
    setMaxArea('');
    setSearchQuery('');
    setSearchParams({});
  };

  const categoryHref = (category: string) => {
    const params = new URLSearchParams(searchParams);
    if (category === 'all') params.delete('category');
    else params.set('category', category);
    return localizedPath(location.pathname + (params.size ? `?${params}` : ''), locale);
  };

  const handleLoadMore = () => {
    startAppend(() => setBatch(current => ({ filterKey, count: nextCatalogCount(current.filterKey === filterKey ? current.count : 8, displayed.length) })));
  };

  const visibleListings = displayed.slice(0, visibleCount);
  const hasMore = visibleCount < displayed.length;
  // Meta Search: top results of the current filters (debounced; no-op without META_PIXEL_ID).
  useMetaSearch(displayed.slice(0, 10).map(listing => listing.id), searchQuery, filterDistrict, !isLoading && !isError);

  useEffect(() => {
    const previous = readCatalogView(location.key);
    const view = { category: filterCategory, tab: activeTab, district: filterDistrict, rooms: filterRooms, minPrice, maxPrice, minArea, maxArea, query: searchQuery, sort: sortBy, filterKey, count: visibleCount, scrollY: previous?.scrollY ?? window.scrollY };
    saveCatalogView(location.key, view);
    const rememberScroll = () => {
      // The outgoing route can remain suspended while its destination loads.
      // Ignore that destination's scroll reset after history has already moved.
      if ((window.history.state?.key ?? 'default') !== location.key) return;
      saveCatalogView(location.key, { ...view, scrollY: window.scrollY });
    };
    window.addEventListener('scroll', rememberScroll, { passive: true });
    return () => window.removeEventListener('scroll', rememberScroll);
  }, [location.key, filterCategory, activeTab, filterDistrict, filterRooms, minPrice, maxPrice, minArea, maxArea, searchQuery, sortBy, filterKey, visibleCount]);

  useLayoutEffect(() => {
    if (restoredRef.current || isLoading) return;
    restoredRef.current = true;
    if (navigationType === 'POP' && savedView) window.scrollTo({ top: savedView.scrollY, behavior: 'instant' });
  }, [isLoading, navigationType, savedView]);

  // One observer per filter, rather than per count: a still-visible sentinel
  // cannot repeatedly drain the entire catalog without another intersection.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || isLoading || isError || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      startAppend(() => setBatch(current => ({ filterKey, count: nextCatalogCount(current.filterKey === filterKey ? current.count : 8, displayed.length) })));
    }, { rootMargin: '280px 0px' });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [filterKey, displayed.length, isLoading, isError]);

  return (
    <div data-public-catalog="true" className="pt-20 pb-16 lg:pb-4 min-h-screen bg-gray-50">
      <div className="section-padding">
        <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 mb-2">
          {tx(t.listings.title)}
        </h1>
        <p className="text-gray-500 mb-4">
          {isLoading
            ? tx("Загружаем объекты...")
            : isError
              ? tx("Каталог временно недоступен")
              : tx("Найдено {0} {1}", { "0": displayed.length, "1": objectsWord(displayed.length, locale) })}
        </p>

        <DistrictLinks />

        {/* Category chips — hidden while only apartments are enabled */}
        {visibleCategories.length > 1 && (
          <div className="flex gap-2 flex-wrap mb-3">
            {(['all', ...visibleCategories] as const).map(cat => (
              <a
                key={cat}
                data-public-catalog-category={cat}
                href={categoryHref(cat)}
                onClick={event => {
                  if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
                  event.preventDefault();
                  setFilterCategory(cat);
                }}
                className={`px-4 py-2 rounded-full text-xs font-semibold transition-all ${filterCategory === cat ? 'text-white' : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'}`}
                style={filterCategory === cat ? { backgroundColor: '#1a4d3a' } : {}}
              >
                {cat === 'all' ? tx("Все типы") : tx(CATEGORY_LABELS[cat])}
              </a>
            ))}
          </div>
        )}

        {/* Search */}
        <div className="relative mb-4">
          <Search className="w-4 h-4 text-gray-400 absolute left-4 top-1/2 -translate-y-1/2" />
          {/* type="search" и явное имя: placeholder экранный диктор читает не
              всегда и не как имя поля, поэтому поле было для него безымянным —
              «правка текста» и всё. */}
          <input
            type="search"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            aria-label={tx("Поиск по каталогу объектов")}
            placeholder={tx("Поиск по названию, району или адресу…")}
            className="w-full pl-11 pr-10 py-3 rounded-xl bg-white border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-800/30"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              aria-label={tx("Очистить поиск")}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Tabs + Sort */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div className="flex gap-2 flex-wrap">
            {/* `as const` вместо `as any`: ключи вкладок — тот же закрытый набор,
                что и у activeTab, и опечатка в нём должна ловиться компилятором,
                а не молча превращаться в фильтр, который ничего не находит. */}
            {([
              { key: 'all', label: t.listings.all },
              { key: 'new', label: t.listings.new },
              { key: 'secondary', label: t.listings.secondary },
              { key: 'urgent', label: 'Срочные' },
            ] as const).map(tab => (
              <button
                key={tab.key}
                data-public-catalog-action={`tab:${tab.key}`}
                onClick={() => setActiveTab(tab.key)}
                className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${activeTab === tab.key ? 'text-white' : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'}`}
                style={activeTab === tab.key ? { backgroundColor: tab.key === 'urgent' ? '#dc2626' : '#1a4d3a' } : {}}
              >
                {tx(tab.label)}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              data-public-catalog-action="filters"
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition-all ${showFilters ? 'text-white border-transparent' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
              style={showFilters ? { backgroundColor: '#1a4d3a' } : {}}
            >
              <SlidersHorizontal className="w-4 h-4" />  {tx("Фильтры")} </button>
            <div className="relative">
              <button data-public-catalog-action="sort" onClick={() => setSortOpen(!sortOpen)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-gray-200 text-sm font-medium hover:bg-gray-50">
                <SortAsc className="w-4 h-4" /> {tx(sortBy)}
              </button>
              {sortOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setSortOpen(false)} />
                  <div className="absolute right-0 top-full mt-2 w-60 bg-white rounded-xl shadow-xl border z-50 py-2">
                    {SORT_OPTIONS.map(opt => (
                      <button key={opt} onClick={() => { setSortBy(opt); setSortOpen(false); }} className={`block w-full text-left px-4 py-2.5 text-sm ${sortBy === opt ? 'text-emerald-800 font-semibold bg-emerald-50' : 'hover:bg-gray-50'}`}>
                        {tx(opt)}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Expandable filter panel */}
        {showFilters && (
          <div
            className="bg-white rounded-2xl p-5 border border-gray-100 mb-4"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* District */}
              <div>
                <label htmlFor="listings-field-1" className="text-xs text-gray-500 mb-1.5 block">{tx("Район")}</label>
                <select id="listings-field-1"
                  value={filterDistrict}
                  onChange={e => setFilterDistrict(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-800/30"
                >
                  {DISTRICTS.map(d => <option key={d} value={d === 'Все районы' ? '' : d}>{tx(d)}</option>)}
                </select>
              </div>
              {/* Rooms */}
              <div>
                <label htmlFor="listings-field-2" className="text-xs text-gray-500 mb-1.5 block">{tx("Комнаты")}</label>
                <select id="listings-field-2"
                  value={filterRooms}
                  onChange={e => setFilterRooms(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-800/30"
                >
                  {ROOMS.map(r => <option key={r} value={r === 'Все' ? '' : r}>{tx(r)}</option>)}
                </select>
              </div>
              {/* Price min */}
              <div>
                <label htmlFor="listings-field-3" className="text-xs text-gray-500 mb-1.5 block">{tx("Цена от (тыс. сомони)")}</label>
                <input id="listings-field-3"
                  type="number"
                  value={minPrice}
                  onChange={e => setMinPrice(e.target.value)}
                  placeholder="500"
                  className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-800/30"
                />
              </div>
              {/* Price max */}
              <div>
                <label htmlFor="listings-field-4" className="text-xs text-gray-500 mb-1.5 block">{tx("Цена до (тыс. сомони)")}</label>
                <input id="listings-field-4"
                  type="number"
                  value={maxPrice}
                  onChange={e => setMaxPrice(e.target.value)}
                  placeholder="5000"
                  className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-800/30"
                />
              </div>
              {/* Area min */}
              <div>
                <label htmlFor="listings-field-5" className="text-xs text-gray-500 mb-1.5 block">{tx("Площадь от (м²)")}</label>
                <input id="listings-field-5"
                  type="number"
                  value={minArea}
                  onChange={e => setMinArea(e.target.value)}
                  placeholder="40"
                  className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-800/30"
                />
              </div>
              {/* Area max */}
              <div>
                <label htmlFor="listings-field-6" className="text-xs text-gray-500 mb-1.5 block">{tx("Площадь до (м²)")}</label>
                <input id="listings-field-6"
                  type="number"
                  value={maxArea}
                  onChange={e => setMaxArea(e.target.value)}
                  placeholder="200"
                  className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-800/30"
                />
              </div>
            </div>
            {hasActiveFilters && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
                <span className="text-xs text-gray-500">{tx("Найдено:")} {displayed.length} {tx(objectsWord(displayed.length, locale))}</span>
                <button onClick={clearFilters} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-red-600 hover:bg-red-50 transition-colors">
                  <X className="w-4 h-4" />  {tx("Сбросить все")} </button>
              </div>
            )}
          </div>
        )}

        {/* Active filter tags */}
        {hasActiveFilters && (
          <div className="flex flex-wrap gap-2 mb-4">
            {searchQuery && (
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-emerald-50 text-emerald-800 text-xs font-medium">
                «{tx(searchQuery)}» <button onClick={() => setSearchQuery('')} aria-label={tx("Убрать поиск")}><X className="w-3 h-3" /></button>
              </span>
            )}
            {filterDistrict && (
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-emerald-50 text-emerald-800 text-xs font-medium">
                {tx(filterDistrict)} <button onClick={() => setFilterDistrict('')} aria-label={tx("Убрать фильтр по району")}><X className="w-3 h-3" /></button>
              </span>
            )}
            {filterRooms && (
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-emerald-50 text-emerald-800 text-xs font-medium">
                {tx(filterRooms)} {filterRooms === '4+' ? tx("комнаты") : filterRooms === '1' ? tx("комната") : tx("комнаты")} <button onClick={() => setFilterRooms('')} aria-label={tx("Убрать фильтр по комнатам")}><X className="w-3 h-3" /></button>
              </span>
            )}
            {minPrice && (
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-emerald-50 text-emerald-800 text-xs font-medium">
                 {tx("от")} {tx(minPrice)}  {tx("тыс.")} <button onClick={() => setMinPrice('')} aria-label={tx("Убрать фильтр «цена от»")}><X className="w-3 h-3" /></button>
              </span>
            )}
            {maxPrice && (
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-emerald-50 text-emerald-800 text-xs font-medium">
                 {tx("до")} {tx(maxPrice)}  {tx("тыс.")} <button onClick={() => setMaxPrice('')} aria-label={tx("Убрать фильтр «цена до»")}><X className="w-3 h-3" /></button>
              </span>
            )}
          </div>
        )}

        {/* Results */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4" role="status" aria-label={tx("Загрузка объектов")}>
            {Array.from({ length: 8 }, (_, index) => (
              <div key={index} className="overflow-hidden rounded-2xl border border-gray-100 bg-white" aria-hidden="true">
                <div className="aspect-[16/10] bg-gray-100" />
                <div className="p-4">
                  <div className="mb-1 h-7 w-1/2 rounded bg-gray-100" />
                  <div className="mb-1.5 h-10 rounded bg-gray-100" />
                  <div className="mb-3 h-4 w-2/3 rounded bg-gray-100" />
                  <div className="mb-3 h-10 rounded bg-gray-100" />
                  <div className="mb-3 h-5 w-3/4 rounded bg-gray-100" />
                  <div className="border-t border-gray-100 pt-2"><div className="h-4 w-1/3 rounded bg-gray-100" /></div>
                </div>
              </div>
            ))}
          </div>
        ) : displayed.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
              <Search className="w-8 h-8 text-gray-300" />
            </div>
            {isError ? (
              /* Сервер не ответил — это НЕ «объектов пока нет». Хук отдаёт isError
                 с самого начала, страница его просто не брала, и отказ каталога
                 выглядел как пустая база: посетитель уходил, решив, что у
                 агентства нет ни одной квартиры. */
              <>
                <h2 className="text-lg font-bold text-gray-900 mb-2">{tx("Не удалось загрузить каталог")}</h2>
                <p className="text-gray-500 mb-4">{tx("Проверьте соединение и обновите страницу — объекты никуда не делись.")}</p>
                <button
                  onClick={() => window.location.reload()}
                  className="px-6 py-2.5 rounded-xl text-sm font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 transition-colors"
                >
                   {tx("Обновить")} </button>
              </>
            ) : hasActiveFilters ? (
              <>
                {/* Есть чем объяснить нулевой результат — виноваты фильтры, «сбросить» реально помогает. */}
                <h2 className="text-lg font-bold text-gray-900 mb-2">{tx("Ничего не найдено")}</h2>
                <p className="text-gray-500 mb-4">{tx("Попробуйте изменить параметры поиска")}</p>
                <button onClick={clearFilters} className="px-6 py-2.5 rounded-xl text-sm font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 transition-colors">
                   {tx("Сбросить фильтры")} </button>
              </>
            ) : (
              /* Фильтров нет — объектов просто пока нет в базе. Прежний текст обвинял
                 фильтры пользователя и предлагал «сбросить» нечего сбрасывать. */
              <>
                <h2 className="text-lg font-bold text-gray-900 mb-2">{tx("Объектов пока нет")}</h2>
                <p className="text-gray-500">{tx("Скоро здесь появятся новые предложения — загляните позже.")}</p>
              </>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4" aria-busy={isAppending}>
              {visibleListings.map((listing, i) => (
                <div key={listing.id}>
                  <ListingCard listing={listing} priority={i === 0} />
                </div>
              ))}
            </div>

            <div ref={sentinelRef} className="min-h-20 text-center mt-6 py-3">
              <p className="text-xs text-gray-500" aria-live="polite">{tx('Показано')} {visibleListings.length} {tx('из')} {displayed.length}</p>
              {hasMore ? (
                <>
                  {supportsAutoLoading && <p className="mt-2 text-sm text-gray-500">{tx('Следующие объекты появятся при прокрутке')}</p>}
                  <button onClick={handleLoadMore} disabled={isAppending} className="mt-3 rounded-lg px-4 py-2 text-sm font-semibold text-emerald-800 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-emerald-800 disabled:opacity-60">
                    {tx('Загрузить следующие объекты')}
                  </button>
                </>
              ) : <p className="mt-2 text-sm text-gray-500">{tx('Вы просмотрели все найденные объекты')}</p>}
            </div>
          </>
        )}
        {!isLoading && !isError && !hasActiveFilters && displayed.length > 0 && <CatalogBuyingGuide />}
      </div>
    </div>
  );
}
