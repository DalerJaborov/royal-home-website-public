import { listingTitle, listingLocation, listingDescription, listingDate } from '@/lib/listingPresentation';
import { englishPropertyMeta } from '@contracts/english-catalog';
import { tajikPropertyMeta } from '@contracts/tajik-catalog';
import { listingSeoTitle } from '@contracts/listing-seo-title';
import { useLocale } from '@/hooks/useLocale';
import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { Link } from '@/components/LocalizedLink';
import { Heart, MapPin, BedDouble, Square, Building2, ArrowLeft, ChevronLeft, ChevronRight, Maximize2, Calendar, Instagram, Phone, Play } from 'lucide-react';
import { pricePerMeter, formatPrice, getListingCoords, getDistrictName, type Listing } from '../data/listings';
import { useListingData, useListingsData } from '@/hooks/useListingsData';
import { useSeo, SITE_ORIGIN } from '@/hooks/useSeo';
import { listingJsonLd } from '@contracts/listing-jsonld';
import { COMPANY_CONTACTS } from '@contracts/company-contacts';
import { localizedPath } from '@contracts/public-i18n';
import WhatsAppIcon from '@/components/WhatsAppIcon';
import { useTrackListingEvent } from '@/hooks/useAnalytics';
import { useMetaListingView } from '@/hooks/useMetaPixel';
import { useFavorites } from '../contexts/FavoritesContext';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import CardPhotoCarousel, { NoPhotoPlaceholder } from '@/components/CardPhotoCarousel';
import { listingFactRows } from '@contracts/listing-facts';
import ShareButton from '@/components/ShareButton';
import ThumbnailImage from '@/components/ThumbnailImage';
import { buildGallerySlides } from '@/lib/gallerySlides';

/**
 * Показывать ли карту с точным расположением объекта. Выключено по решению
 * владельца: клиент не должен узнавать адрес до обращения в агентство, иначе он
 * приходит на объект сам, минуя нас.
 *
 * Оставлено флагом, а не удалено: включить обратно — поменять одно слово.
 *
 * ВАЖНО, чего этот флаг НЕ скрывает: поле `location` содержит улицу и номер дома
 * («Душанбе, р-н Шохмансур, ул. Шохина, 25») и показывается в карточках списка и
 * в SEO-описании. То есть сам адрес это не прячет — решение за владельцем.
 *
 * Координаты (`lat`, `lng`, `mapAddress`) из публичного ответа уже вырезаны —
 * см. hideExactLocation в api/listing-router.ts. Админу они по-прежнему приходят.
 */
const SHOW_LOCATION_MAP = false;

function getSimilarListings(all: Listing[], current: Listing, count = 3) {
  // «Похожие» — это предложение альтернативы, проданные объекты не предлагаем.
  const others = all.filter(l => l.id !== current.id && !l.sold);
  const scored = others.map(l => {
    let score = 0;
    if (l.rooms === current.rooms) score += 3;
    if (l.type === current.type) score += 2;
    const currentDistrict = getDistrictName(current.location, '');
    const otherDistrict = getDistrictName(l.location, '');
    if (currentDistrict && otherDistrict && currentDistrict === otherDistrict) score += 2;
    const priceDiff = Math.abs(l.price - current.price) / current.price;
    if (priceDiff < 0.3) score += 1;
    const areaDiff = Math.abs(l.area - current.area) / current.area;
    if (areaDiff < 0.3) score += 1;
    return { listing: l, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, count).map(s => s.listing);
}

function FeatureBadge({ value }: { value: string }) {
  const { text: tx } = useLocale();
  if (!value) return null; // защита: пустое значение больше не роняет страницу
  const negative = ['нет', 'без ', 'не ', 'отсутствует'];
  const isNegative = negative.some(n => value.toLowerCase().includes(n));
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap ${isNegative ? 'bg-gray-100 text-gray-500' : 'bg-emerald-50 text-emerald-800'}`}>
      {tx(value)}
    </span>
  );
}

// ============================================
// Swipeable Gallery with drag-and-follow
// ============================================
// Высота нативной панели управления <video>: жест, начатый на ней (перемотка,
// громкость), принадлежит плееру, а не галерее.
const VIDEO_CONTROLS_ZONE_PX = 56;

function startsOnVideoControls(target: EventTarget | null, clientY: number) {
  if (!(target instanceof HTMLVideoElement)) return false;
  return clientY > target.getBoundingClientRect().bottom - VIDEO_CONTROLS_ZONE_PX;
}

export function SwipeableGallery({ images, videoUrl }: { images: string[]; videoUrl?: string | null }) {
  const { text: tx } = useLocale();
  // Ролик — вторым слайдом (после первого фото), см. lib/gallerySlides.ts.
  const slides = useMemo(() => buildGallerySlides(images, videoUrl), [images, videoUrl]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [loadedPhotos, setLoadedPhotos] = useState(() => new Set([0, 1]));
  const [offset, setOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const startX = useRef(0);
  const startY = useRef(0);
  const currentX = useRef(0);
  const axis = useRef<'h' | 'v' | null>(null);
  const containerWidth = useRef(0);
  const currentIdxRef = useRef(0);

  useEffect(() => { currentIdxRef.current = currentIdx; }, [currentIdx]);

  // Ушли со слайда-ролика — ставим на паузу, иначе звук продолжит играть за кадром.
  useEffect(() => {
    if (slides[currentIdx]?.kind !== 'video') videoRef.current?.pause();
  }, [currentIdx, slides]);

  // Ширина в ref — для обработчиков жеста, в состоянии — для рендера. Рендер
  // читал ref напрямую, а его React не отслеживает: до первой перерисовки по
  // другой причине сдвиг пальца считался от нулевой ширины.
  const [width, setWidth] = useState(0);

  const updateWidth = useCallback(() => {
    if (!containerRef.current) return;
    const w = containerRef.current.offsetWidth;
    containerWidth.current = w;
    setWidth(w);
  }, []);

  // Observe the laid-out gallery instead of forcing layout during React commit.
  const attachContainer = useCallback((el: HTMLDivElement | null) => {
    containerRef.current = el;
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (typeof ResizeObserver === 'undefined') {
      const frame = requestAnimationFrame(updateWidth);
      window.addEventListener('resize', updateWidth, { passive: true });
      return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', updateWidth); };
    }
    const observer = new ResizeObserver(([entry]) => {
      containerWidth.current = entry.contentRect.width;
      setWidth(entry.contentRect.width);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [updateWidth]);

  const goTo = useCallback((idx: number) => {
    if (idx < 0) idx = 0;
    if (idx >= slides.length) idx = slides.length - 1;
    setLoadedPhotos(previous => new Set([...previous, idx - 1, idx, idx + 1]));
    setCurrentIdx(idx);
    setOffset(0);
  }, [slides.length]);

  const goNext = useCallback(() => goTo(currentIdxRef.current + 1), [goTo]);
  const goPrev = useCallback(() => goTo(currentIdxRef.current - 1), [goTo]);

  // Touch handled via NATIVE listeners (not React's synthetic onTouch*, which
  // are passive — there preventDefault is a no-op). We lock to the horizontal
  // axis on the first unambiguous move and only then call preventDefault, so a
  // photo swipe no longer "slips" into a vertical page scroll on the first try
  // (and a vertical scroll is never hijacked by the gallery).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (startsOnVideoControls(e.target, touch.clientY)) { axis.current = 'v'; return; }
      startX.current = touch.clientX;
      startY.current = touch.clientY;
      currentX.current = touch.clientX;
      axis.current = null;
      updateWidth();
      setIsDragging(true);
    };

    const onMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      const dx = touch.clientX - startX.current;
      const dy = touch.clientY - startY.current;

      if (axis.current === null) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        axis.current = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
        if (axis.current === 'v') { setIsDragging(false); return; }
      }
      if (axis.current !== 'h') return;

      // We own this gesture now — stop the browser from scrolling the page.
      e.preventDefault();
      currentX.current = touch.clientX;
      setOffset(dx);
    };

    const onEnd = () => {
      if (axis.current === 'h') {
        const dx = currentX.current - startX.current;
        const threshold = containerWidth.current * 0.15;
        if (dx < -threshold && currentIdxRef.current < slides.length - 1) goNext();
        else if (dx > threshold && currentIdxRef.current > 0) goPrev();
      }
      axis.current = null;
      setIsDragging(false);
      setOffset(0);
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd, { passive: true });
    el.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [slides.length, goNext, goPrev, updateWidth]);

  // Mouse
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (startsOnVideoControls(e.target, e.clientY)) return;
    setIsDragging(true);
    startX.current = e.clientX;
    currentX.current = e.clientX;
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    currentX.current = e.clientX;
    const dx = currentX.current - startX.current;
    setOffset(dx);
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    if (!isDragging) return;
    setIsDragging(false);
    const dx = currentX.current - startX.current;
    const threshold = containerWidth.current * 0.15;
    if (dx < -threshold && currentIdx < slides.length - 1) {
      goNext();
    } else if (dx > threshold && currentIdx > 0) {
      goPrev();
    }
    setOffset(0);
  }, [isDragging, currentIdx, slides.length, goNext, goPrev]);

  const handleMouseLeave = useCallback(() => {
    if (!isDragging) return;
    setIsDragging(false);
    const dx = currentX.current - startX.current;
    const threshold = containerWidth.current * 0.15;
    if (dx < -threshold && currentIdx < slides.length - 1) {
      goNext();
    } else if (dx > threshold && currentIdx > 0) {
      goPrev();
    }
    setOffset(0);
  }, [isDragging, currentIdx, slides.length, goNext, goPrev]);

  // Spring physics for smooth snap
  const transitionStyle = isDragging
    ? 'none'
    : 'transform 0.35s cubic-bezier(0.25, 1, 0.5, 1)';

  const baseOffset = -currentIdx * 100;
  const dragPercent = width > 0 ? (offset / width) * 100 : 0;
  const totalOffset = baseOffset + dragPercent;

  return (
    <div className="w-full">
      {/* Main image with arrows */}
      <div
        ref={attachContainer}
        className="relative w-full aspect-[4/3] sm:aspect-[16/10] overflow-hidden rounded-2xl bg-gray-100 select-none"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        style={{ cursor: isDragging ? 'grabbing' : 'grab', touchAction: 'pan-y' }}
      >
        {/* Sliding track */}
        <div
          className="flex h-full will-change-transform"
          style={{
            transform: `translateX(${totalOffset}%)`,
            transition: transitionStyle,
          }}
        >
          {slides.map((slide, i) => (
            <div key={i} className="w-full h-full flex-shrink-0 flex items-center justify-center">
              {slide.kind === 'video' ? (
                // Вертикальный ролик 9:16 вписывается без растяжения (object-contain на
                // тёмном фоне). preload="none": файл с сервера CRM не качается, пока
                // человек не нажал play; poster — первое фото, оно уже загружено.
                loadedPhotos.has(i) && <video
                  ref={videoRef}
                  src={slide.src}
                  poster={images[0]}
                  controls
                  playsInline
                  preload="none"
                  aria-label={tx("Видео объекта")}
                  className="w-full h-full object-contain bg-black"
                />
              ) : (
                loadedPhotos.has(i) && <img
                  src={slide.src}
                  alt={tx("Фото {0}", { "0": slide.photoNumber })}
                  className="w-full h-full object-cover pointer-events-none"
                  width={1200}
                  height={900}
                  loading={i === 0 ? 'eager' : 'lazy'}
                  fetchPriority={i === 0 ? 'high' : 'low'}
                  decoding="async"
                  draggable={false}
                />
              )}
            </div>
          ))}
        </div>

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent pointer-events-none" />

        {/* Left arrow */}
        {currentIdx > 0 && (
          <button
            onClick={(e) => { e.stopPropagation(); goPrev(); }}
            aria-label={tx("Предыдущее фото")}
            className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/90 backdrop-blur flex items-center justify-center shadow-lg z-20 hover:bg-white active:scale-95 transition-all"
          >
            <ChevronLeft className="w-5 h-5 text-gray-700" />
          </button>
        )}

        {/* Right arrow */}
        {currentIdx < slides.length - 1 && (
          <button
            onClick={(e) => { e.stopPropagation(); goNext(); }}
            aria-label={tx("Следующее фото")}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/90 backdrop-blur flex items-center justify-center shadow-lg z-20 hover:bg-white active:scale-95 transition-all"
          >
            <ChevronRight className="w-5 h-5 text-gray-700" />
          </button>
        )}

        {/* Dots */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 z-10 pointer-events-none">
          {slides.map((_, d) => (
            <div
              key={d}
              className={`h-1.5 rounded-full transition-all ${
                d === currentIdx ? 'bg-white w-5' : 'bg-white/50 w-1.5'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Thumbnails row — inner track is `w-max mx-auto` so it centres when the
          thumbnails fit and scrolls (pinned left) when they don't; px-4 keeps
          the selected ring from being clipped at the first/last item. */}
      <div className="mt-5 overflow-x-auto py-2 scrollbar-hide">
        <div className="flex gap-2 px-4 w-max mx-auto">
          {slides.map((slide, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              aria-pressed={i === currentIdx}
              aria-label={slide.kind === 'video' ? tx("Видео объекта") : undefined}
              className={`relative flex-shrink-0 w-20 h-20 sm:w-24 sm:h-24 rounded-xl overflow-hidden transition-all ${
                i === currentIdx
                  ? 'ring-2 ring-emerald-500 ring-offset-2'
                  : 'opacity-60 hover:opacity-100'
              }`}
            >
              {slide.kind === 'video' ? (
                // Миниатюра ролика: первое фото под затемнением со значком play.
                <>
                  {images[0] ? <ThumbnailImage src={images[0]} alt="" loading="lazy" fetchPriority="low" width={96} height={96} className="w-full h-full object-cover" /> : <span className="block w-full h-full bg-gray-800" />}
                  <span className="absolute inset-0 flex items-center justify-center bg-black/40" aria-hidden="true">
                    <Play className="w-7 h-7 text-white fill-white" />
                  </span>
                </>
              ) : (
                <ThumbnailImage src={slide.src} alt={tx("Миниатюра {0}", { "0": slide.photoNumber })} loading="lazy" fetchPriority="low" width={96} height={96} className="w-full h-full object-cover" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Photo count */}
      <div className="flex items-center gap-2 mt-2">
        <span className="text-xs text-gray-500 font-medium">{images.length}  {tx("фото")}{videoUrl ? ` · ${tx("видео")}` : ''}</span>
      </div>
    </div>
  );
}

// ============================================
// Main Page Component
// ============================================
export default function ListingDetailPage() {
  const { text: tx, locale, path } = useLocale();
  const { id } = useParams();
  const { listing, isLoading, isNotFound } = useListingData(Number(id));
  const { listings: allListings } = useListingsData();
  const { isFav: isFavFn, toggleFav } = useFavorites();
  const trackListingEvent = useTrackListingEvent();
  // Meta ViewContent + remembers this listing for lead forms (no-op without META_PIXEL_ID).
  useMetaListingView(listing?.id);
  const [mapOpen, setMapOpen] = useState(false);
  const [similarCount, setSimilarCount] = useState(3);
  const similar = useMemo(
    () => (listing ? getSimilarListings(allListings, listing, 100) : []),
    [allListings, listing]
  );

  // Per-listing SEO — уникальные title/description/og + JSON-LD Product с ценой.
  // Хук вызывается безусловно (до early-return), значения берём из объекта, когда он есть.
  const listingUrl = `${SITE_ORIGIN}${path(`/listing/${id}`)}`;
  const absUrl = (u: string) => (u.startsWith('http') ? u : `${SITE_ORIGIN}${u.startsWith('/') ? '' : '/'}${u}`);
  const englishSeo = listing && locale === 'en' ? englishPropertyMeta(listing) : undefined;
  const propertySeoTitle = englishSeo?.title ?? (listing
    ? locale === 'tg' ? tajikPropertyMeta(listing).title
      : listing.sold ? `Продано: ${listing.title} — ROYAL HOME` : listing.metaTitle?.trim() || `${listing.title} — ROYAL HOME`
    : 'Объект недвижимости — ROYAL HOME');
  const seoDescription = englishSeo ? englishSeo.description : listing && locale !== 'ru' ? listingDescription(listing, locale, tx) : listing?.sold
    ? `Объект продан: ${listing.title}. Архив объявления ROYAL HOME. Актуальные предложения недвижимости в Душанбе смотрите в каталоге.`
    : (listing?.metaDescription || listing?.seoDesc || '').trim();
  useSeo({
    title: listing && !englishSeo ? listingSeoTitle(propertySeoTitle, listing.crmShortId) : propertySeoTitle,
    description: seoDescription || undefined,
    image: listing?.photos?.[0] ? absUrl(listing.photos[0]) : undefined,
    path: `/listing/${id}`,
    type: 'product',
    pending: isLoading || (!listing && !isNotFound),
    noindex: isNotFound,
    jsonLd: listing
      ? listingJsonLd({ title: englishSeo ? englishSeo.heading : locale === 'ru' ? listing.h1?.trim() || listing.title : listingTitle(listing, locale, tx), description: seoDescription,
          images: listing.photos?.map(absUrl) || [], url: listingUrl, price: listing.price,
          rooms: listing.rooms, area: listing.area, sold: Boolean(listing.sold), category: listing.category })
      : null,
  });

  if (isLoading) {
    return (
      <div className="pt-32 pb-16 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-800 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!listing) {
    const unavailable = locale === 'tg' ? 'Маълумоти объект бор нашуд. Саҳифаро нав кунед.' : locale === 'en' ? 'Unable to load this property. Reload the page.' : 'Не удалось загрузить объект. Обновите страницу.';
    return <div className="pt-32 text-center text-gray-500">{isNotFound ? tx("Объект не найден") : unavailable}</div>;
  }

  const isFav = isFavFn(listing.id);
  // The CRM bot reads «объект №N» as the CRM card number, so the number goes into the
  // message only when the CRM has supplied it; otherwise the link alone identifies the listing.
  const listingLink = SITE_ORIGIN + localizedPath(`/listing/${listing.id}`, locale);
  const whatsappText = listing.crmShortId
    ? tx('Здравствуйте! Интересует объект №{0}: {1}', { '0': listing.crmShortId, '1': listingLink })
    : listingLink;

  // Только настоящие фото объекта. Раньше здесь было две беды сразу:
  // при пустых photos подставлялись стоковые интерьеры ALL_IMAGES (включая фон
  // главной страницы) и подписывались как «N фото» — покупатель ехал на показ
  // с ложными ожиданиями; а при наличии photos список резался по счётчику
  // listing.images, который при повторном синке из CRM не обновляется: догрузили
  // в CRM 8 фото к объекту, заведённому с 2, — на сайте по-прежнему 2, а если
  // первый синк пришёл без фото, галерея оставалась пустой навсегда.
  const images = listing.photos ?? [];
  const ppm = pricePerMeter(listing.price, listing.area);

  const visibleSimilar = similar.slice(0, similarCount);

  // Разбор переехал в getDistrictName (data/listings.ts): он был написан здесь
  // верно, но остальные пять мест продолжали брать «вторую часть» и показывали
  // «Душанбе» вместо района у всех объектов из CRM.
  const districtName = getDistrictName(listing.location);

  const mainFeatures = [
    { label: 'Район', value: districtName },
    { label: 'Комнат', value: `${listing.rooms}` },
    { label: 'Площадь', value: `${listing.area} м²` },
    ...listingFactRows(listing),
    { label: 'Цена/м²', value: `${ppm.toLocaleString('ru-RU')} с.` },
    // У CRM-объектов этаж/ремонт могут отсутствовать — пустые плитки не показываем.
  ].filter((item) => item.value);

  // Показываем только заполненные детали — иначе пустой объект (без деталей) рендерил
  // FeatureBadge со значением undefined и валил страницу в белый экран при раскрытии.
  const isFilled = (v: string | undefined | null): v is string => !!v && v.trim() !== '' && v.trim() !== '—';
  const comfortFeatures = (listing.details ? [
    { label: 'Балкон/лоджия', value: listing.details.balcony },
    { label: 'Санузел', value: listing.details.bathroom },
    { label: 'Высота потолков', value: listing.details.ceilingHeight },
    { label: 'Окна', value: listing.details.windows },
    { label: 'Отопление', value: listing.details.heating },
    { label: 'Лифт', value: listing.details.elevator },
    { label: 'Мебель', value: listing.details.furniture },
    { label: 'Техника', value: listing.details.appliances },
    { label: 'Интернет', value: listing.details.internet },
  ] : []).filter((f) => isFilled(f.value)) as { label: string; value: string }[];

  const infraFeatures = (listing.details ? [
    { label: 'Год постройки', value: listing.details.yearBuilt },
    { label: 'Материал стен', value: listing.details.material },
    { label: 'Парковка', value: listing.details.parking },
    { label: 'Безопасность', value: listing.details.security },
  ] : []).filter((f) => isFilled(f.value)) as { label: string; value: string }[];

  const [listingLat, listingLng] = getListingCoords(listing);
  // mapAddress иногда хранит саму ссылку на карту (её вставляют в поле «Ссылка на карту») —
  // такую строку не показываем и не суём в поиск карты (иначе «0 найдено» и URL в плашке).
  const displayAddress =
    listing.mapAddress && !/^https?:\/\//i.test(listing.mapAddress) ? listing.mapAddress : listing.location;
  // Координаты уже задают точку (pt/ll); текстовый поиск оставляем только адресом,
  // чтобы не всплывало «0 найдено» по ссылке.
  const mapSrc = `https://yandex.com/map-widget/v1/?z=16&ll=${listingLng},${listingLat}&pt=${listingLng},${listingLat},pm2rdl&text=${encodeURIComponent(displayAddress)}`;

  return (
    <div className="pt-20 pb-20 lg:pb-4 min-h-screen bg-white">
      {/* Top bar — sticky below header, NOT fixed to avoid z-index overlap */}
      <div className="bg-white border-b border-gray-100 px-4">
        <div className="flex items-center justify-between h-14 max-w-3xl mx-auto">
          <Link to="/listings" className="flex items-center gap-2 px-3 py-2 rounded-xl text-gray-700 hover:bg-gray-100 transition-colors">
            <ArrowLeft className="w-5 h-5" />
            <span className="text-sm font-medium">{tx("Назад к объектам")}</span>
          </Link>
          <div className="flex items-center gap-2">
            {/* Объявление смотрят не для себя — его пересылают. Ссылку берём
                каноническую (listingUrl), а не из адресной строки: в ней могут
                оказаться метки рекламной кампании, и они уедут вместе со ссылкой
                всем, кому её перешлют. */}
            <ShareButton
              title={listingTitle(listing, locale, tx)}
              text={`${listing.title} — ${formatPrice(listing.price)}, ${listing.location}`}
              url={listingUrl}
              onShare={() => trackListingEvent(listing.id, 'share')}
            />
            <button
              onClick={() => toggleFav(listing.id)}
              aria-label={isFav ? tx("Убрать из избранного") : tx("Добавить в избранное")}
              aria-pressed={isFav}
              className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
                isFav ? 'bg-red-50 text-red-500' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              <Heart className={`w-5 h-5 ${isFav ? 'fill-red-500' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 pt-2">
        {/* Gallery */}
        {images.length > 0 || listing.videoUrl ? (
          <SwipeableGallery key={listing.id} images={images} videoUrl={listing.videoUrl} />
        ) : (
          <div className="relative w-full aspect-[4/3] rounded-2xl overflow-hidden">
            <NoPhotoPlaceholder />
          </div>
        )}

        {/* Title & Price */}
        <div className="mt-5">
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-2xl font-extrabold text-emerald-800">{tx(formatPrice(listing.price))}</span>
            <span className="text-sm text-gray-400">{tx(ppm.toLocaleString('ru-RU'))}  {tx("с./м²")}</span>
          </div>
          <h1 className="text-lg font-bold text-gray-900 leading-snug">{locale === 'ru' ? listing.h1?.trim() || listing.title : listingTitle(listing, locale, tx)}</h1>
          <p className="text-sm text-gray-500 mt-1 flex items-center gap-1">
            <MapPin className="w-4 h-4" /> {listingLocation(listing, locale, tx)}
          </p>
          <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" /> {listingDate(listing.date, locale)}
          </p>
        </div>

        {/* The assistant receives the public property reference and localized URL. */}
        {!listing.sold && (
          <div className="mt-4 space-y-2">
            <a
              href={`${COMPANY_CONTACTS.whatsappHref}?text=${encodeURIComponent(whatsappText)}`}
              target="_blank" rel="noopener noreferrer"
              onClick={() => trackListingEvent(listing.id, 'whatsapp')}
              className="flex min-h-12 items-center justify-center gap-2 w-full rounded-xl bg-[#1a4d3a] text-white font-bold text-sm px-3 py-3 hover:brightness-95 transition-colors"
            >
              <WhatsAppIcon className="w-5 h-5 shrink-0" />
              {tx('Написать в WhatsApp')}{listing.crmShortId ? ` · №${listing.crmShortId}` : ''}
            </a>
            <a href={COMPANY_CONTACTS.callHref} onClick={() => trackListingEvent(listing.id, 'phone')}
              className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-gray-200 text-gray-700 text-sm px-3 py-2 hover:bg-gray-50 transition-colors">
              <Phone className="w-4 h-4" /> {tx('Позвонить')} · {COMPANY_CONTACTS.callDisplay}
            </a>
          </div>
        )}

        {/* Quick stats — пустые значения (например, этаж у CRM-объектов) скрываем */}
        <div className={`grid gap-2 mt-4 ${listing.floor ? 'grid-cols-4' : 'grid-cols-3'}`}>
          {[
            { icon: BedDouble, label: 'Комнат', value: `${listing.rooms}` },
            { icon: Square, label: 'Площадь', value: tx("{0} м²", { "0": listing.area }) },
            { icon: Building2, label: 'Этаж', value: listing.floor },
            { icon: MapPin, label: 'Тип', value: listing.type },
          ].filter((item) => item.value).map((item, i) => (
            <div key={i} className="p-3 rounded-xl bg-gray-50 border border-gray-100 text-center">
              <item.icon className="w-4 h-4 text-gray-400 mx-auto mb-1" />
              <div className="text-[10px] text-gray-500">{tx(item.label)}</div>
              <div className="text-xs font-bold text-gray-900">{tx(item.value)}</div>
            </div>
          ))}
        </div>

        {/* Tags */}
        <div className="flex flex-wrap gap-2 mt-4">
          {listing.type && <span className="px-3 py-1.5 rounded-lg text-sm font-medium bg-emerald-50 text-emerald-800">{tx(listing.type)}</span>}
          {listing.stage && <span className="px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-100 text-gray-600">{tx("Стадия:")} {tx(listing.stage)}</span>}
          {listing.repair && <span className="px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-50 text-blue-700">{tx(listing.repair)}</span>}
          {listing.sold
            ? <span className="px-3 py-1.5 rounded-lg text-sm font-bold bg-gray-800 text-white">{tx("Продано")}</span>
            : listing.urgent && <span className="px-3 py-1.5 rounded-lg text-sm font-bold bg-red-50 text-red-600">{tx("Срочная")}</span>}
          {listing.instagramUrl && (
            <a
              href={listing.instagramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-gradient-to-tr from-amber-50 via-pink-50 to-purple-50 text-pink-700 border border-pink-100 hover:opacity-90 transition-opacity"
            >
              <Instagram className="w-4 h-4" />  {tx("Смотреть видео в Instagram")} </a>
          )}
        </div>

        {/* About — реальное описание (написанное агентом/в CRM) в приоритете; seoDesc
            (авто-сгенерированный маркетинговый текст для SEO/сниппетов) — только запасной
            вариант для старых объектов сайта без ручного описания. Раньше здесь всегда
            показывался seoDesc, из-за чего объекты с настоящим описанием в CRM всё равно
            показывали дежурный шаблонный текст на сайте. */}
        {(locale !== 'ru' || listing.description || listing.seoDesc) && (
          <div className="mt-6 pt-6 border-t border-gray-100">
            <h3 className="text-xl font-bold text-gray-900 mb-3">{tx("О квартире")}</h3>
            <p className="text-base text-gray-700 leading-relaxed">{listingDescription(listing, locale, tx)}</p>
          </div>
        )}

        {/* Тавсиф бо забони тоҷикӣ — контент дар ҳамон саҳифа, на роутинг ҷудогона:
            барои SEO дузабонӣ (RU+TJ) кофист, ки матни воқеӣ дар як URL бошад. */}
        {locale === 'ru' && listing.descriptionTj && (
          <div className="mt-6 pt-6 border-t border-gray-100">
            <h3 className="text-xl font-bold text-gray-900 mb-3">{tx("Тавсифи хона (тоҷикӣ)")}</h3>
            <p className="text-base text-gray-700 leading-relaxed whitespace-pre-line">{tx(listing.descriptionTj)}</p>
          </div>
        )}

        {/* Characteristics — main specs always visible, rest collapsible */}
        <div className="mt-6 pt-6 border-t border-gray-100">
          <h3 className="text-lg font-bold text-gray-900 mb-4">{tx("Характеристики")}</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            {mainFeatures.map((item, i) => (
              <div key={i} className="rounded-xl bg-gray-50 border border-gray-100 px-3 py-2.5">
                <div className="text-[11px] text-gray-400 mb-0.5">{tx(item.label)}</div>
                <div className="text-sm font-bold text-gray-900">{tx(item.value)}</div>
              </div>
            ))}
          </div>
          <Accordion type="multiple" className="space-y-3">
            {comfortFeatures.length > 0 && (
              <AccordionItem value="comfort" className="border rounded-2xl px-4 bg-gray-50/50">
                <AccordionTrigger className="text-sm font-bold hover:no-underline py-3">{tx("Комфорт")}</AccordionTrigger>
                <AccordionContent>
                  <div className="flex flex-wrap gap-2 pb-2">
                    {comfortFeatures.map((item, i) => (
                      <div key={i} className="flex flex-col gap-0.5">
                        <span className="text-[10px] text-gray-400">{tx(item.label)}</span>
                        <FeatureBadge value={item.value} />
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            )}

            {infraFeatures.length > 0 && (
              <AccordionItem value="infra" className="border rounded-2xl px-4 bg-gray-50/50">
                <AccordionTrigger className="text-sm font-bold hover:no-underline py-3">{tx("Инфраструктура")}</AccordionTrigger>
                <AccordionContent>
                  <div className="flex flex-wrap gap-2 pb-2">
                    {infraFeatures.map((item, i) => (
                      <div key={i} className="flex flex-col gap-0.5">
                        <span className="text-[10px] text-gray-400">{tx(item.label)}</span>
                        <FeatureBadge value={item.value} />
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            )}
          </Accordion>
        </div>

        {/* Map */}
        {SHOW_LOCATION_MAP && (
          <div className="mt-6 pt-6 border-t border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-bold text-gray-900">{tx("Расположение на карте")}</h3>
              <button
                onClick={() => setMapOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-800 hover:bg-emerald-100 transition-colors"
              >
                <Maximize2 className="w-3.5 h-3.5" />  {tx("Показать на карте")} </button>
            </div>
            <div className="rounded-2xl overflow-hidden border border-gray-100 h-64 lg:h-80 bg-gray-100 relative">
              <iframe
                src={mapSrc}
                width="100%"
                height="100%"
                frameBorder="0"
                allowFullScreen
                className="w-full h-full"
                title={tx("Карта — {0}", { "0": listing.location })}
              />
            </div>
            <div className="flex items-center gap-2 mt-3 p-3 rounded-xl bg-emerald-50 border border-emerald-100">
              <MapPin className="w-4 h-4 text-emerald-700 flex-shrink-0" />
              <span className="text-sm text-emerald-800 font-medium">{tx(displayAddress)}</span>
            </div>
          </div>
        )}

        {/* Map Modal */}
        {SHOW_LOCATION_MAP && (
          <Dialog open={mapOpen} onOpenChange={setMapOpen}>
            <DialogContent className="max-w-4xl w-[95vw] h-[80vh] p-0 overflow-hidden">
              <DialogHeader className="px-4 pt-4 pb-0">
                <DialogTitle className="text-base">{tx(displayAddress)}</DialogTitle>
              </DialogHeader>
              <div className="flex-1 h-full min-h-[60vh] m-4 mt-2 rounded-xl overflow-hidden border border-gray-100">
                <iframe
                  src={mapSrc}
                  width="100%"
                  height="100%"
                  frameBorder="0"
                  allowFullScreen
                  className="w-full h-full"
                  title={tx("Карта — {0}", { "0": listing.location })}
                />
              </div>
            </DialogContent>
          </Dialog>
        )}

        {/* Similar listings */}
        {visibleSimilar.length > 0 && (
          <div className="mt-8 pt-6 border-t border-gray-100">
            <h3 className="text-lg font-bold text-gray-900 mb-4">{tx("Похожие объекты")}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {visibleSimilar.map(l => (
                <Link
                  key={l.id}
                  to={`/listing/${l.id}`}
                  className="bg-white rounded-xl overflow-hidden border border-gray-100 hover:shadow-md transition-all block"
                >
                  <div className="aspect-[16/10] overflow-hidden bg-gray-100">
                    {/* Без .jpg-подстановки: таких файлов в проекте нет (фото лежат
                        в .webp), и посетитель видел битую картинку. Карусель сама
                        рисует фирменную заглушку, когда фотографий нет. */}
                    <CardPhotoCarousel photos={l.photos ?? []} alt={listingTitle(l, locale, tx)} />
                  </div>
                  <div className="p-3">
                    <div className="text-base font-extrabold text-emerald-800 mb-0.5">{tx(formatPrice(l.price))}</div>
                    <div className="text-xs text-gray-900 font-medium line-clamp-1">{listingTitle(l, locale, tx)}</div>
                    <div className="flex items-center gap-2 mt-1 text-[10px] text-gray-500">
                      <span>{l.rooms}{tx("-ком")}</span>
                      <span>{l.area}  {tx("м²")}</span>
                      <span>{tx(l.floor)}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
            {similarCount < similar.length && (
              <div className="text-center mt-4">
                <button
                  onClick={() => setSimilarCount(c => c + 3)}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl border border-emerald-800 text-emerald-800 text-sm font-semibold hover:bg-emerald-50 transition-colors"
                >
                   {tx("Загрузить ещё")} </button>
              </div>
            )}
          </div>
        )}
        <div className="mt-6 pb-4" />
      </div>
    </div>
  );
}
