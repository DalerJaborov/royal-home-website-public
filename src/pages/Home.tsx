import { listingTitle, listingDescription } from '@/lib/listingPresentation';
import { useLocale } from '@/hooks/useLocale';
import { getLeadSubmissionSource } from '@/lib/acquisitionAttribution';
import { lazy, Suspense, useState, useEffect, useRef } from 'react';
import { Link } from '@/components/LocalizedLink';
import { useNavigate } from '@/hooks/useLocalizedNavigate';
import Reveal from '@/components/Reveal';
import { Search, MapPin, BedDouble, Square, Building2, Heart, Check, SortAsc, ArrowRight } from 'lucide-react';
import { useFavorites } from '../contexts/FavoritesContext';
import { objectsWord } from '../lib/plural';
import { useCms, CATEGORY_LABELS, type CategoryVisibility } from '../contexts/CmsContext';
import { localizedPath } from '@contracts/public-i18n';
import { readHomeSearch } from '@/lib/homeSearch';
import { resolveHeroImage } from '@contracts/hero-image';
import { useSeo } from '../hooks/useSeo';
import { getListingImage, pricePerMeter, formatPrice, getDistrictName, type Listing } from '../data/listings';
import type { Translations } from '../data/translations';
import { useCreateLead } from '@/hooks/useCreateLead';
import { useListingsData } from '@/hooks/useListingsData';
import CardPhotoCarousel from '@/components/CardPhotoCarousel';
import ThumbnailImage from '@/components/ThumbnailImage';
import DeferredImage from '@/components/DeferredImage';
import { useAntiSpam } from '@/hooks/useAntiSpam';
import HoneypotField from '@/components/HoneypotField';

// These sections sit below the initial hero/catalogue. Their JS and service
// stylesheet must not suspend the hero or ship with every catalogue visit.
const ReelsSection = lazy(() => import('@/components/ReelsSection'));
const HomeServices = lazy(() => import('@/components/HomeServices').then(module => ({ default: module.HomeServices })));
const HomeServicePromotions = lazy(() => import('@/components/HomeServices').then(module => ({ default: module.HomeServicePromotions })));

// Shared card photo carousel lives in components/CardPhotoCarousel.tsx —
// this thin wrapper keeps existing <CardImageCarousel listingId> call sites.
// Defined at module scope (not inside Home) so it keeps a stable identity
// across renders — otherwise every Home() re-render (e.g. the hero's 3.8s
// auto-rotate interval) would redefine it as a "new" component type and
// force React to unmount/remount every card, which read as random jumps.
function CardImageCarousel({ photos, title }: { listingId?: number; photos?: string[]; title?: string }) {
  // Подстановки чужих снимков нет намеренно: во-первых, файлов .jpg в проекте не
  // существует (фото лежат в .webp) и посетитель видел битые картинки; во-вторых,
  // показывать под объектом чужой интерьер — обманывать покупателя. Карусель сама
  // рисует фирменную заглушку «Фото скоро появятся», когда фотографий нет.
  return <CardPhotoCarousel photos={photos ?? []} alt={title} />;
}

function HeroFloatCard({ listing, badge }: { listing: Listing; badge: string }) {
  const { text: tx, locale } = useLocale();
  const [settled, setSettled] = useState(false);
  return (
    <Link
      to={`/listing/${listing.id}`}
      className={`float-card ${settled ? 'settled' : ''}`}
      onAnimationEnd={(event) => { if (event.animationName === 'cardIn') setSettled(true); }}
    >
      {listing.urgent && <span className="card-badge">{tx(badge)}</span>}
      <ThumbnailImage variant="card" className="card-img" src={listing.photos?.[0] || getListingImage(listing.id)} alt={listingTitle(listing, locale, tx)} />
      <div className="card-body">
        <div className="card-title">{listingTitle(listing, locale, tx)}</div>
        <div className="card-price">{tx(formatPrice(listing.price))}</div>
        <div className="card-meta">{listing.rooms}  {tx("комн ·")} {listing.area}  {tx("м²")}</div>
        <div className="card-hint">{tx("Смотреть объект →")}</div>
      </div>
    </Link>
  );
}

// AURA-style listing card — module scope for the same stable-identity reason as above.
function AurListingCard({ listing, size = 'normal', favorites, onToggleFav }: { listing: Listing; size?: 'normal' | 'large' | 'small'; favorites: number[]; onToggleFav: (id: number) => void }) {
  const { text: tx, locale } = useLocale();
  const isFav = favorites.includes(listing.id);
  const isLarge = size === 'large';

  if (isLarge) {
    return (
      <Link to={`/listing/${listing.id}`} className="bg-white rounded-2xl overflow-hidden border border-gray-100 hover:shadow-lg transition-all block">
        <div className="relative overflow-hidden bg-gray-100" style={{ aspectRatio: '16/10' }}>
          <CardImageCarousel listingId={listing.id} photos={listing.photos} title={listingTitle(listing, locale, tx)} />
          {listing.sold ? (
            <span className="absolute top-3 left-3 px-2.5 py-1 rounded-md text-[11px] font-bold bg-gray-800 text-white uppercase z-10">{tx("Продано")}</span>
          ) : listing.urgent && (
            <span className="absolute top-3 left-3 px-2.5 py-1 rounded-md text-[11px] font-bold bg-red-500 text-white uppercase z-10">{tx("Срочная")}</span>
          )}
          <button
            onClick={(e) => { e.preventDefault(); onToggleFav(listing.id); }}
            aria-label={isFav ? tx("Убрать из избранного") : tx("Добавить в избранное")}
            aria-pressed={isFav}
            className={`absolute top-3 right-3 z-10 w-8 h-8 rounded-full flex items-center justify-center shadow-md transition-all ${isFav ? 'bg-red-500 text-white' : 'bg-white/90 text-gray-500'}`}
          >
            <Heart className={`w-3.5 h-3.5 ${isFav ? 'fill-white' : ''}`} />
          </button>
        </div>
        <div className="p-4">
          <div className="flex items-baseline justify-between mb-1">
            <span className="text-xl font-extrabold text-emerald-800">{tx(formatPrice(listing.price))}</span>
            <span className="flex items-center gap-1 text-xs text-gray-400"><MapPin className="w-3 h-3" /> {tx(getDistrictName(listing.location))}</span>
          </div>
          <h3 className="text-sm font-bold text-gray-900 mb-2 line-clamp-2">{listingTitle(listing, locale, tx)}</h3>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-500 mb-3">
            <span className="flex items-center gap-1"><BedDouble className="w-3 h-3" /> {listing.rooms}{tx("-ком")}</span>
            <span className="flex items-center gap-1"><Square className="w-3 h-3" /> {listing.area}  {tx("м²")}</span>
            <span className="flex items-center gap-1"><Building2 className="w-3 h-3" /> {tx(listing.floor)}</span>
          </div>
          <div className="flex items-center pt-2 border-t border-gray-100">
            <span className="text-[10px] text-gray-400 ml-auto">{tx(listing.date)}</span>
          </div>
        </div>
      </Link>
    );
  }

  // Small card (for 2×2 grid)
  return (
    <Link to={`/listing/${listing.id}`} className="bg-white rounded-xl overflow-hidden border border-gray-100 hover:shadow-md transition-all block">
      <div className="relative aspect-[16/10] overflow-hidden bg-gray-100">
        <CardImageCarousel listingId={listing.id} photos={listing.photos} title={listingTitle(listing, locale, tx)} />
        {listing.sold ? (
          <span className="absolute top-2 left-2 px-2 py-0.5 rounded text-[10px] font-bold bg-gray-800 text-white uppercase z-10">{tx("Продано")}</span>
        ) : listing.urgent && (
          <span className="absolute top-2 left-2 px-2 py-0.5 rounded text-[10px] font-bold bg-red-500 text-white uppercase z-10">{tx("Срочная")}</span>
        )}
        <button
          onClick={(e) => { e.preventDefault(); onToggleFav(listing.id); }}
          aria-label={isFav ? tx("Убрать из избранного") : tx("Добавить в избранное")}
          aria-pressed={isFav}
          className={`absolute top-2 right-2 z-10 w-7 h-7 rounded-full flex items-center justify-center shadow-sm transition-all ${isFav ? 'bg-red-500 text-white' : 'bg-white/90 text-gray-500'}`}
        >
          <Heart className={`w-3 h-3 ${isFav ? 'fill-white' : ''}`} />
        </button>
      </div>
      <div className="p-3">
        <div className="flex items-baseline justify-between mb-0.5">
          <span className="text-base font-extrabold text-emerald-800">{tx(formatPrice(listing.price))}</span>
          <span className="flex items-center gap-0.5 text-[10px] text-gray-400"><MapPin className="w-2.5 h-2.5" /> {tx(getDistrictName(listing.location, '').slice(0, 8))}</span>
        </div>
        <h3 className="text-xs font-bold text-gray-900 mb-1.5 line-clamp-2">{listingTitle(listing, locale, tx)}</h3>
        <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-gray-500 mb-2">
          <span>{listing.rooms}{tx("-ком")}</span>
          <span>{listing.area}  {tx("м²")}</span>
          <span>{tx(listing.floor)}</span>
        </div>
      </div>
    </Link>
  );
}

// Module scope for the same stable-identity reason as CardImageCarousel above.
function ListingCard({ listing, size = 'normal', favorites, onToggleFav }: { listing: Listing; size?: 'normal' | 'large'; favorites: number[]; onToggleFav: (id: number) => void }) {
  const { text: tx, locale } = useLocale();
  const isFav = favorites.includes(listing.id);
  const ppm = pricePerMeter(listing.price, listing.area);
  const isLarge = size === 'large';
  const district = getDistrictName(listing.location, listing.location);

  return (
    <Link to={`/listing/${listing.id}`} className={`bg-white rounded-2xl overflow-hidden border border-gray-100 hover:shadow-lg transition-all duration-300 block relative ${isLarge ? '' : 'hover:-translate-y-1'}`}>
      <CardImageCarousel listingId={listing.id} photos={listing.photos} title={listingTitle(listing, locale, tx)} />
      <button
        onClick={(e) => { e.preventDefault(); onToggleFav(listing.id); }}
        aria-label={isFav ? tx("Убрать из избранного") : tx("Добавить в избранное")}
        aria-pressed={isFav}
        className={`absolute top-3 right-3 z-10 w-8 h-8 rounded-full flex items-center justify-center shadow-md transition-all ${isFav ? 'bg-red-500 text-white' : 'bg-white/90 text-gray-500'}`}
      >
        <Heart className={`w-3.5 h-3.5 ${isFav ? 'fill-white' : ''}`} />
      </button>

      <div className={`${isLarge ? 'p-5' : 'p-4'}`}>
        <div className="flex items-baseline gap-2 mb-1">
          <span className={`font-extrabold text-emerald-800 ${isLarge ? 'text-2xl' : 'text-xl'}`}>{tx(formatPrice(listing.price))}</span>
          <span className="text-xs text-gray-500">{tx(ppm.toLocaleString('ru-RU'))}  {tx("с./м²")}</span>
        </div>
        <h3 className={`font-bold text-gray-900 mb-2 line-clamp-2 leading-snug ${isLarge ? 'text-base' : 'text-sm'}`}>{listingTitle(listing, locale, tx)}</h3>

        {/* Brief info only */}
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500 mb-3">
          <span className="flex items-center gap-1"><BedDouble className="w-3.5 h-3.5" /> {listing.rooms}{tx("-ком")}</span>
          <span className="flex items-center gap-1"><Square className="w-3.5 h-3.5" /> {listing.area}  {tx("м²")}</span>
          <span className="flex items-center gap-1"><Building2 className="w-3.5 h-3.5" /> {tx(listing.floor)}</span>
          <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {tx(district)}</span>
        </div>

        <div className="flex items-center pt-2 border-t border-gray-100">
          <div className="text-[11px] text-gray-500">{tx(listing.date)}</div>
        </div>
        <p className="sr-only">{locale === 'ru' ? listing.seoDesc : listingDescription(listing, locale, tx)}</p>
      </div>
    </Link>
  );
}

export default function Home({ t }: { t: Translations }) {
  const { text: tx, locale } = useLocale();
  const { favorites, toggleFav } = useFavorites();
  const { cms } = useCms();
  useSeo({ title: cms.site.pageSeo.home.title, description: cms.site.pageSeo.home.description });
  const navigate = useNavigate();
  const createLead = useCreateLead();
  const { hp, setHp, getAntiSpamFields } = useAntiSpam('home_banner_lead');
  const { listings: LISTINGS } = useListingsData();
  const [sortBy, setSortBy] = useState('Без сортировки');
  const [sortOpen, setSortOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'new' | 'secondary'>('all');
  const [urgentTab, setUrgentTab] = useState<'new' | 'secondary'>('new');
  const [phone, setPhone] = useState('');
  const [phoneSent, setPhoneSent] = useState(false);
  // Категория из того же справочника, что и фильтр каталога. Раньше здесь был
  // свой список строк («Квартира»/«Дом»/«Дача»), который уходил в ?type= — а
  // каталог такого параметра не читает вовсе, поэтому выбор молча терялся.
  // «Дачи» в каталоге к тому же нет ни одной категорией.
  // Native dropdowns retain choices made before React finishes loading.
  const searchBarRef = useRef<HTMLDivElement>(null);
  // Значение читается сразу при первом рендере, а не после него: раньше первым
  // кадром всегда шло false, и автопрокрутка hero успевала стартовать даже у
  // человека, попросившего систему уменьшить движение.
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
  const [mobIdx, setMobIdx] = useState(0);
  const [mobCycle, setMobCycle] = useState(0);
  const [mobExiting, setMobExiting] = useState<{ idx: number; cycle: number } | null>(null);
  const mobIdxRef = useRef(0);
  const mobCycleRef = useRef(0);
  const mobCardWrapRef = useRef<HTMLDivElement>(null);
  const [mobHeightLocked, setMobHeightLocked] = useState(false);

  // Эффект только подписывается на изменение настройки; начальное значение уже
  // прочитано выше.
  useEffect(() => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    const listener = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mql.addEventListener('change', listener);
    return () => mql.removeEventListener('change', listener);
  }, []);

  // Hero: listings selected in admin (falls back to first 2 if empty).
  // A hero card is an advertisement — once the listing is sold it drops out
  // instead of promoting a sold object as available.
  const heroSupportsCards = cms.hero.variant !== 'photo-clean';
  const tajikDefaultHeadline = locale === 'tg' && cms.hero.title === 'НАЙДИТЕ СВОЙ' && cms.hero.titleHighlight === 'ИДЕАЛЬНЫЙ ДОМ';
  const heroSelectedListings = (cms.hero.selected.length ? cms.hero.selected : [1, 2])
    .map(id => LISTINGS.find(l => l.id === id))
    .filter((l): l is typeof LISTINGS[number] => Boolean(l) && !l!.sold);
  const heroImage = resolveHeroImage(cms.hero);

  useEffect(() => { mobIdxRef.current = mobIdx; }, [mobIdx]);
  useEffect(() => { mobCycleRef.current = mobCycle; }, [mobCycle]);

  // Pause the hero rotation once the hero scrolls out of view. The rotation
  // setState re-renders the whole Home tree every few seconds; leaving it
  // running while the user is further down the page (e.g. the bank/mortgage
  // strip) made those sections visibly flicker "like a refresh". No hero on
  // screen → nothing to animate → no re-renders down-page.
  const [heroInView, setHeroInView] = useState(true);
  useEffect(() => {
    const heroEl = document.getElementById('hero');
    if (!heroEl || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([entry]) => setHeroInView(entry.isIntersecting));
    io.observe(heroEl);
    return () => io.disconnect();
  }, []);

  // Mobile card auto-rotation — old card flies up and away ("blown by wind"),
  // new one rises in from below with alternating left/right tilt, mirroring
  // showMobCard/buildMobCardEl from the reference hero markup.
  useEffect(() => {
    if (prefersReducedMotion || heroSelectedListings.length <= 1 || !heroInView) return;
    const interval = setInterval(() => {
      setMobExiting({ idx: mobIdxRef.current, cycle: mobCycleRef.current });
      setMobIdx(prev => (prev + 1) % heroSelectedListings.length);
      setMobCycle(prev => prev + 1);
    }, 3800);
    return () => clearInterval(interval);
  }, [prefersReducedMotion, heroSelectedListings.length, heroInView]);

  // Lock mobile card container height once
  useEffect(() => {
    const wrap = mobCardWrapRef.current;
    if (!wrap || mobHeightLocked) return;
    const firstCard = wrap.querySelector('.mob-card');
    if (firstCard) {
      wrap.style.height = (firstCard as HTMLElement).offsetHeight + 'px';
      setMobHeightLocked(true);
    }
  }, [mobIdx, mobHeightLocked]);

  const handleSearch = () => {
    const query = readHomeSearch(searchBarRef.current);
    navigate(`/listings${query ? `?${query}` : ''}`);
  };

  // Sold listings stay in the catalog with a «Продано» badge, but a sold
  // object is no longer urgent — keep it out of the «Срочные» rail.
  // Вкладки соответствуют своим подписям: раньше кнопка «Новостройки» ставила
  // режим all и показывала всё подряд, а «Вторичка» — режим new и показывала
  // новостройки, из-за чего вторичное жильё в этом блоке не показывалось никогда.
  const urgent = LISTINGS.filter(
    l => l.urgent && !l.sold && (urgentTab === 'new' ? l.type === 'Новостройки' : l.type === 'Вторичка')
  );
  const featured1 = urgent[0];
  const urgentRest = urgent.slice(1, 5);

  let displayed = activeTab === 'all' ? LISTINGS : activeTab === 'new' ? LISTINGS.filter(l => l.type === 'Новостройки') : LISTINGS.filter(l => l.type === 'Вторичка');
  if (sortBy === 'Цена — по возрастанию') displayed = [...displayed].sort((a, b) => a.price - b.price);
  else if (sortBy === 'Цена — по убыванию') displayed = [...displayed].sort((a, b) => b.price - a.price);
  else if (sortBy === 'Площадь — по возрастанию') displayed = [...displayed].sort((a, b) => a.area - b.area);
  else if (sortBy === 'Площадь — по убыванию') displayed = [...displayed].sort((a, b) => b.area - a.area);
  // Без сортировки: новые объекты всегда выше старых (по id — надёжнее текстового
  // date), проданные — в конце. Явно на фронте, не полагаемся молча на порядок API.
  else displayed = [...displayed].sort((a, b) => Number(a.sold) - Number(b.sold) || b.id - a.id);

  return (
    <div className="pt-0">
      {/* ===== HERO ===== */}
      <section
        className={`hero variant-${cms.hero.variant} ${heroSupportsCards && cms.hero.cardsOn ? 'cards-on' : ''}`}
        id="hero"
        style={{ '--overlay-strength': cms.hero.overlayStrength } as React.CSSProperties}
      >
        <div className="hero-bg-parallax">
          {/* LCP image: a real <img srcset> (not a CSS background) so the browser
              picks a viewport-sized file and can preload it — see the matching
              server preload in api/lib/vite.ts. */}
          {heroImage && <img
            className="hero-bg"
            src={heroImage.src}
            srcSet={heroImage.srcSet}
            sizes="100vw"
            alt=""
            aria-hidden="true"
            fetchPriority="high"
            decoding="async"
          />}
        </div>
        <div className="hero-overlay" />
        <div className="hero-flat-bg" />

        {/* Floating cards: desktop only */}
        <div className="float-card-wrap card-1">
          {heroSelectedListings[0] && <HeroFloatCard key={heroSelectedListings[0].id} listing={heroSelectedListings[0]} badge="Топ" />}
        </div>
        <div className="float-card-wrap card-2">
          {heroSelectedListings[1] && <HeroFloatCard key={heroSelectedListings[1].id} listing={heroSelectedListings[1]} badge="Новое" />}
        </div>

        <div className="hero-content">
          <h1 className="headline">
            {/* Пробел перед переносом обязателен: на экране строки и так разделены <br>,
                но в текстовом виде заголовок склеивался в «СВОЙИДЕАЛЬНЫЙ ДОМ». Именно так
                его читают поисковые роботы и скринридеры, а H1 это сильнейший сигнал страницы. */}
            {tajikDefaultHeadline ? <>
              <span className="l2">{tx(cms.hero.titleHighlight)} </span><br />
              <span style={{ color: '#fff' }}>{tx(cms.hero.title)}</span>
            </> : <>
              <span style={{ color: '#fff' }}>{tx(cms.hero.title)} </span><br />
              <span className="l2">{tx(cms.hero.titleHighlight)}</span>
            </>}
          </h1>
          <p className="subtext">
            {tx(cms.hero.subtitle)}
          </p>

          {/* Mobile floating card */}
          <div className="mob-card-wrap" ref={mobCardWrapRef}>
            {heroSupportsCards && cms.hero.cardsOn && mobExiting && (() => {
              const listing = heroSelectedListings[mobExiting.idx % heroSelectedListings.length];
              if (!listing) return null;
              const restRot = (mobExiting.cycle % 2 === 0) ? 3 : -3;
              const exitRot = restRot * 1.6;
              return (
                <Link
                  to={`/listing/${listing.id}`}
                  className="mob-card exiting"
                  key={`mob-exit-${mobExiting.idx}-${mobExiting.cycle}`}
                  style={{ '--rest-rot': `${restRot}deg`, '--exit-rot': `${exitRot}deg` } as React.CSSProperties}
                  onAnimationEnd={() => setMobExiting(null)}
                  tabIndex={-1}
                >
                  {listing.urgent && <span className="card-badge">{tx("Топ")}</span>}
                  <ThumbnailImage
                    variant="card"
                    className="card-img"
                    src={listing.photos?.[0] || getListingImage(listing.id)}
                    alt={listingTitle(listing, locale, tx)}
                  />
                  <div className="card-body">
                    <div className="card-title">{listingTitle(listing, locale, tx)}</div>
                    <div className="card-price">{tx(formatPrice(listing.price))}</div>
                    <div className="card-meta">{listing.rooms}  {tx("комн ·")} {listing.area}  {tx("м²")}</div>
                    <div className="card-hint">{tx("Смотреть →")}</div>
                  </div>
                </Link>
              );
            })()}
            {heroSupportsCards && cms.hero.cardsOn && (() => {
              const listing = heroSelectedListings[mobIdx % heroSelectedListings.length];
              if (!listing) return null;
              const restRot = (mobCycle % 2 === 0) ? 3 : -3;
              const enterRot = restRot * 1.8;
              return (
                <Link
                  to={`/listing/${listing.id}`}
                  className="mob-card entering"
                  key={`mob-${mobIdx}-${mobCycle}`}
                  style={{ '--rest-rot': `${restRot}deg`, '--enter-rot': `${enterRot}deg` } as React.CSSProperties}
                >
                  {listing.urgent && <span className="card-badge">{tx("Топ")}</span>}
                  <ThumbnailImage
                    variant="card"
                    className="card-img"
                    src={listing.photos?.[0] || getListingImage(listing.id)}
                    alt={listingTitle(listing, locale, tx)}
                  />
                  <div className="card-body">
                    <div className="card-title">{listingTitle(listing, locale, tx)}</div>
                    <div className="card-price">{tx(formatPrice(listing.price))}</div>
                    <div className="card-meta">{listing.rooms}  {tx("комн ·")} {listing.area}  {tx("м²")}</div>
                    <div className="card-hint">{tx("Смотреть →")}</div>
                  </div>
                </Link>
              );
            })()}
          </div>

          <div className="cta-row">
            <Link to="/listings" className="btn-hero btn-hero-primary">{tx("Купить")}</Link>
            <Link to="/sell" className="btn-hero btn-hero-secondary">{tx("Продать")}</Link>
          </div>

          <div className="search-bar" data-public-search ref={searchBarRef}>
            <div className="search-field">
              <Building2 width={18} height={18} />
              <select
                defaultValue="all"
                data-home-filter="category"
                aria-label={tx("Тип объекта")}
                style={{ background: 'transparent', border: 'none', fontSize: '14.5px', fontWeight: 500, color: '#233b30', cursor: 'pointer', width: '100%', outline: 'none' }}
              >
                <option value="all">{tx("Все типы")}</option>
                {(Object.keys(CATEGORY_LABELS) as (keyof CategoryVisibility)[])
                  .filter(k => cms.categoryVisibility[k])
                  .map(k => (
                    <option key={k} value={k}>{tx(CATEGORY_LABELS[k])}</option>
                  ))}
              </select>
            </div>
            <div className="search-divider" />
            <div className="search-field">
              <MapPin width={18} height={18} />
              <select
                aria-label={tx("Район")}
                defaultValue="Все районы"
                data-home-filter="district"
                style={{ background: 'transparent', border: 'none', fontSize: '14.5px', fontWeight: 500, color: '#233b30', cursor: 'pointer', width: '100%', outline: 'none' }}
              >
                <option value="Все районы">{tx("Все районы")}</option>
                <option value="Сино">{tx("Сино")}</option>
                <option value="Шохмансур">{tx("Шохмансур")}</option>
                <option value="Фирдавси">{tx("Фирдавси")}</option>
                <option value="И. Сомони">{tx("И. Сомони")}</option>
              </select>
            </div>
            <div className="search-divider" />
            <div className="search-field">
              <BedDouble width={18} height={18} />
              <select
                aria-label={tx("Количество комнат")}
                defaultValue="Комнаты"
                data-home-filter="rooms"
                style={{ background: 'transparent', border: 'none', fontSize: '14.5px', fontWeight: 500, color: '#233b30', cursor: 'pointer', width: '100%', outline: 'none' }}
              >
                <option value="Комнаты">{tx("Комнаты")}</option>
                <option>1</option>
                <option>2</option>
                <option>3</option>
                <option>4+</option>
              </select>
            </div>
            <button className="search-btn" onClick={handleSearch} data-public-action="search" data-public-search-path={localizedPath('/listings', locale)}>
              <Search width={16} height={16} style={{ color: '#0e2a20' }} />
               {tx("Найти")} </button>
          </div>
        </div>
      </section>

      {/* ===== INSTAGRAM REELS — placed right after the hero so it's visible without deep scrolling ===== */}
      <Suspense fallback={null}><ReelsSection /></Suspense>

      <Suspense fallback={null}><HomeServices /></Suspense>

      {/* ===== URGENT: AURA-style 1 big left + 4 small right =====
          Секция скрыта целиком, когда срочных объектов нет (после снятия
          демо-данных все реальные объекты идут без флага «срочная»). */}
      {urgent.length > 0 && (
      <section className="py-12 bg-gray-50">
        <div className="section-padding">
          <h2 className="text-2xl lg:text-3xl font-bold text-gray-900 mb-4">{tx(t.urgent.title)}</h2>
          <div className="flex gap-2 mb-6">
            {[{ key: 'new' as const, label: t.listings.new }, { key: 'secondary' as const, label: t.listings.secondary }].map(tab => (
              <button key={tab.key} onClick={() => setUrgentTab(tab.key)} className={`px-5 py-2 rounded-xl text-sm font-semibold transition-all ${urgentTab === tab.key ? 'text-white' : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'}`} style={urgentTab === tab.key ? { backgroundColor: '#1a4d3a' } : {}}>{tx(tab.label)}</button>
            ))}
          </div>

          {featured1 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
              {/* Big left card */}
              <AurListingCard listing={featured1} size="large" favorites={favorites} onToggleFav={toggleFav} />
              {/* Right: 2×2 grid */}
              <div className="grid grid-cols-2 gap-4">
                {urgentRest.slice(0, 4).map(l => (
                  <AurListingCard key={l.id} listing={l} size="small" favorites={favorites} onToggleFav={toggleFav} />
                ))}
              </div>
            </div>
          )}

          <div className="text-center">
            <Link to="/listings?tab=urgent" className="btn-royal inline-flex items-center gap-2 px-8 py-3.5 rounded-xl font-bold text-sm">
               {tx("Смотреть все срочные")} <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>
      )}

      <Suspense fallback={null}><HomeServicePromotions /></Suspense>

      {/* ===== ALL LISTINGS: 9 items ===== */}
      <section className="py-12 bg-gray-50">
        <div className="section-padding">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <h2 className="text-2xl lg:text-3xl font-bold text-gray-900">{tx(t.listings.title)}</h2>
            <div className="relative">
              <button onClick={() => setSortOpen(!sortOpen)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-gray-200 text-sm font-medium hover:bg-gray-50"><SortAsc className="w-4 h-4" /> {tx(sortBy)}</button>
              {sortOpen && (<><div className="fixed inset-0 z-40" onClick={() => setSortOpen(false)} /><div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-xl border z-50 py-2">{['Без сортировки', 'Цена — по возрастанию', 'Цена — по убыванию', 'Площадь — по возрастанию', 'Площадь — по убыванию'].map(opt => (<button key={opt} onClick={() => { setSortBy(opt); setSortOpen(false); }} className={`block w-full text-left px-4 py-2.5 text-sm ${sortBy === opt ? 'text-emerald-800 font-semibold bg-emerald-50' : 'hover:bg-gray-50'}`}>{tx(opt)}</button>))}</div></>)}
            </div>
          </div>
          <div className="flex gap-2 mb-6">
            {/* `as const` вместо `as any`: ключи вкладок — тот же закрытый набор, что и у
                activeTab (см. ListingsPage.tsx), опечатка должна ловиться компилятором. */}
            {([{ key: 'all', label: t.listings.all }, { key: 'new', label: t.listings.new }, { key: 'secondary', label: t.listings.secondary }] as const).map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)} className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${activeTab === tab.key ? 'text-white' : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'}`} style={activeTab === tab.key ? { backgroundColor: '#1a4d3a' } : {}}>{tx(tab.label)}</button>
            ))}
          </div>
          {displayed.length === 0 ? (
            /* Пустая база (или редкий фильтр «Новостройки»/«Вторичка» без совпадений)
               раньше рендерила пустой <div> — резкий обрыв сразу после кнопок-вкладок
               выглядел как сломанная страница, а не как «объектов пока нет». */
            <div className="text-center py-16 px-4 bg-white rounded-2xl border border-gray-100">
              <p className="text-gray-500 text-sm">
                {activeTab === 'all' ? tx("Объектов пока нет — загляните чуть позже.") : tx("В этой категории пока нет объектов.")}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 [&>a:last-child]:sm:col-span-2 [&>a:last-child]:lg:col-span-1">
              {displayed.slice(0, 9).map(l => <ListingCard key={l.id} listing={l} favorites={favorites} onToggleFav={toggleFav} />)}
            </div>
          )}
          {displayed.length > 9 && (
            <div className="text-center mt-8">
              <Link to="/listings" className="btn-royal inline-flex items-center gap-2 px-8 py-3 rounded-xl font-semibold">{tx("Показать все")} {displayed.length} {tx(objectsWord(displayed.length, locale))}</Link>
            </div>
          )}
        </div>
      </section>

      {/* ===== DUSHANBE CTA BANNER — full-bleed photo + brand dark-green
          overlay, same premium treatment as the hero. Replaced the old pale
          mint-green gradient + leaf-multiply overlay, which used colors
          outside the brand palette and left a visible seam where the flat
          color met the photo. ===== */}
      <section className="py-12 bg-gray-50">
        <div className="section-padding">
          <Reveal
            className="relative rounded-3xl overflow-hidden shadow-lg"
            y={30}
          >
            {/* Full-bleed photo on every breakpoint — no seam to hide */}
            <img
              src={cms.dushanbeBanner.bgImage || '/images/banners/cta-interior.webp'}
              alt={tx("Душанбе")}
              loading="lazy"
              decoding="async"
              className="absolute inset-0 w-full h-full object-cover"
            />
            {/* Light brand-green scrim — just enough for the text to read,
                photo stays clearly visible (lighter than the first pass) */}
            <div
              className="absolute inset-0"
              style={{
                background: 'linear-gradient(180deg, rgba(15,46,34,0.55) 0%, rgba(15,46,34,0.3) 55%, rgba(15,46,34,0.6) 100%)',
              }}
            />
            <div
              className="hidden lg:block absolute inset-0"
              style={{
                background: 'linear-gradient(90deg, rgba(15,46,34,0.72) 0%, rgba(15,46,34,0.45) 42%, rgba(15,46,34,0.08) 68%, rgba(15,46,34,0) 100%)',
              }}
            />

            {/* Content */}
            <div className="relative z-10 p-5 sm:p-8 lg:p-12 flex flex-col lg:min-h-[380px] lg:max-w-[56%]">
              {/* Title */}
              <h2 className="text-xl sm:text-2xl lg:text-4xl font-bold text-white mb-3 leading-snug lg:leading-tight">
                {tx(cms.dushanbeBanner.title)}
              </h2>

              {/* Subtitle */}
              <p className="text-xs sm:text-sm lg:text-base text-white/75 mb-5 max-w-xs lg:max-w-sm">
                {tx(cms.dushanbeBanner.subtitle)}
              </p>

              {/* Phone + button */}
              {phoneSent ? (
                <p className="text-sm font-semibold text-emerald-300 mb-4">{tx("Заявка отправлена! Мы вам перезвоним.")}</p>
              ) : (
                <form
                  method="post"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    try {
                      await createLead.mutateAsync({ phone, ...getLeadSubmissionSource('Дом, который вы искали'), ...(await getAntiSpamFields()) });
                      setPhone('');
                      setPhoneSent(true);
                    } catch {
                      alert(tx('Не удалось отправить заявку. Попробуйте ещё раз.'));
                    }
                  }}
                  className="flex flex-col sm:flex-row gap-2 max-w-sm mb-4"
                >
                  <HoneypotField value={hp} onChange={setHp} />
                  <input
                    type="tel"
                    aria-label={tx('Телефон')}
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder={tx(cms.dushanbeBanner.phonePlaceholder)}
                    required
                    className="flex-1 px-4 py-2.5 rounded-xl bg-white/95 backdrop-blur-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-400 text-sm shadow-sm"
                  />
                  <button
                    type="submit"
                    disabled={createLead.isPending}
                    className="px-6 py-2.5 rounded-xl text-sm font-bold transition-all hover:brightness-105 active:scale-[0.98] whitespace-nowrap disabled:opacity-50 shadow-[0_4px_14px_rgba(246,196,83,0.4)]"
                    style={{ backgroundColor: '#F6C453', color: '#0f2e22' }}
                  >
                    {tx(createLead.isPending ? '...' : cms.dushanbeBanner.ctaText)}
                  </button>
                </form>
              )}

              {/* 4 features */}
              <div className="flex flex-wrap gap-x-5 gap-y-2 mt-auto">
                {cms.dushanbeBanner.features.map((label, idx) => {
                  const FeatureIcons = [Building2, Check, Search, Heart];
                  const Icon = FeatureIcons[idx];
                  return (
                    <div key={idx} className="flex items-center gap-1.5">
                      <div className="w-8 h-8 rounded-lg bg-white/12 backdrop-blur-sm flex items-center justify-center flex-shrink-0">
                        {Icon && <Icon className="w-4 h-4 text-amber-300" />}
                      </div>
                      <span className="text-[11px] text-white/85 whitespace-pre-line leading-tight font-medium">{tx(label)}</span>
                    </div>
                  );
                })}
              </div>
            </div>

          </Reveal>
        </div>
      </section>


      {/* ===== MORTGAGE PREVIEW ===== */}
      <section className="py-12 bg-white">
        <div className="section-padding">
          <div className="text-center mb-8">
            <h2 className="text-2xl lg:text-3xl font-bold text-gray-900 mb-3">{tx(t.mortgage.title)}</h2>
            <p className="text-gray-500 max-w-2xl mx-auto">{tx(t.mortgage.subtitle)}</p>
            <Link to="/mortgage" className="btn-royal inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold mt-4">{tx(t.mortgage.calc)}</Link>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 max-w-5xl mx-auto">
            {cms.banks.map((bank, i) => (
              <Reveal key={i} className="p-5 rounded-2xl bg-gray-50 border border-gray-100 text-center hover:shadow-md transition-all" y={20} delay={i * 0.05}>
                <div className="w-full h-24 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-sm overflow-hidden p-3" style={{ backgroundColor: bank.bg }}>
                  <DeferredImage src={bank.logo} alt={tx(bank.name)} loading="eager" className="w-full h-full object-contain" />
                </div>
                <div className="text-sm font-bold text-gray-900">{tx(bank.name)}</div>
                <div className="text-xs text-gray-500 mt-1">{bank.rate}{tx("% годовых")}</div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
