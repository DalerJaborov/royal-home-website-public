import { useLocale } from '@/hooks/useLocale';
import { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, House } from 'lucide-react';
import { toCatalogImageUrl } from '@contracts/image-urls';

/** Фирменная заглушка для объектов без фото — вместо чужих стоковых картинок.
 *  Экспортируется: та же заглушка нужна и на странице объекта, где раньше при
 *  отсутствии фото подставлялись стоковые интерьеры из ALL_IMAGES. */
export function NoPhotoPlaceholder() {
  const { text: tx } = useLocale();
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-emerald-900 via-emerald-800 to-emerald-950">
      <div className="w-14 h-14 rounded-2xl bg-white/10 border border-white/15 backdrop-blur-sm flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]">
        <House className="w-7 h-7 text-amber-300/90" strokeWidth={1.5} />
      </div>
      <span className="text-[11px] font-semibold tracking-wide text-white/70 uppercase">{tx("Фото скоро появятся")}</span>
    </div>
  );
}

/**
 * Photo carousel for listing cards.
 *
 * Desktop: hovering the pagination dots switches photos (moving the mouse
 * across the dot row pages through the images without clicking) — the photo
 * itself is inert to mouse movement, only the dots react. Plus arrows for
 * explicit navigation.
 *
 * Mobile: swipe with drag-follow (photo tracks the finger), snap on release.
 */
export default function CardPhotoCarousel({ photos, alt, priority = false }: { photos?: string[]; alt?: string; priority?: boolean }) {
  const { text: tx } = useLocale();
  const [idx, setIdx] = useState(0);
  const [loadedPhotos, setLoadedPhotos] = useState(() => new Set([0]));
  const [offset, setOffset] = useState(0);
  const [isTouching, setIsTouching] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const startX = useRef(0);
  const startY = useRef(0);
  const currentX = useRef(0);
  const axis = useRef<'h' | 'v' | null>(null);
  const containerWidth = useRef(0);
  const idxRef = useRef(0);

  // Match this card's existing 16:10 centre crop in the downloaded variant.
  // Keep original URLs for the gallery and error fallback.
  const hasPhotos = !!(photos && photos.length > 0);
  const originals = hasPhotos ? photos! : [];
  const images = originals.map(toCatalogImageUrl);

  useEffect(() => { idxRef.current = idx; }, [idx]);

  // Ширина живёт в двух местах намеренно: в ref — для обработчиков жеста (чтобы
  // не пересоздавать нативные слушатели на каждое изменение), в состоянии — для
  // рендера. Раньше рендер читал ref напрямую, а ref React не отслеживает:
  // до первого перерисовывания по другой причине сдвиг считался от нуля.
  const [width, setWidth] = useState(0);

  const updateWidth = () => {
    if (!containerRef.current) return;
    const w = containerRef.current.offsetWidth;
    containerWidth.current = w;
    setWidth(w);
  };

  // Do not measure in React's ref callback: each card can otherwise force a
  // fresh layout while the remaining cards are still being inserted.
  const attachContainer = useCallback((el: HTMLDivElement | null) => {
    containerRef.current = el;
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (typeof ResizeObserver === 'undefined') {
      const frame = requestAnimationFrame(updateWidth);
      window.addEventListener('resize', updateWidth, { passive: true });
      return () => {
        cancelAnimationFrame(frame);
        window.removeEventListener('resize', updateWidth);
      };
    }
    const observer = new ResizeObserver(([entry]) => {
      const nextWidth = entry.contentRect.width;
      if (nextWidth === containerWidth.current) return;
      containerWidth.current = nextWidth;
      setWidth(nextWidth);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const goTo = (newIdx: number) => {
    if (images.length < 2) return;
    let i = newIdx;
    if (i < 0) i = images.length - 1;
    if (i >= images.length) i = 0;
    setLoadedPhotos((previous) => new Set([...previous, i, (i + 1) % images.length, (i - 1 + images.length) % images.length]));
    setIdx(i);
    setOffset(0);
  };

  // ── Mobile: swipe with drag-follow ──
  // Native (non-passive) listeners + directional lock: the card only steals the
  // gesture once it's clearly horizontal, so a vertical list scroll started on a
  // card photo scrolls the page normally instead of being swallowed.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || images.length < 2) return;

    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      startX.current = t.clientX;
      startY.current = t.clientY;
      currentX.current = t.clientX;
      axis.current = null;
      updateWidth();
      // The adjacent slide must be ready when the photo starts following a finger.
      setLoadedPhotos((previous) => new Set([...previous, (idxRef.current + 1) % images.length, (idxRef.current - 1 + images.length) % images.length]));
      setIsTouching(true);
    };
    const onMove = (e: TouchEvent) => {
      const t = e.touches[0];
      const dx = t.clientX - startX.current;
      const dy = t.clientY - startY.current;
      if (axis.current === null) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        axis.current = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
        if (axis.current === 'v') { setIsTouching(false); return; }
      }
      if (axis.current !== 'h') return;
      e.preventDefault();
      currentX.current = t.clientX;
      setOffset(dx);
    };
    const onEnd = () => {
      if (axis.current === 'h') {
        const dx = startX.current - currentX.current;
        const threshold = Math.max(30, containerWidth.current * 0.12);
        if (Math.abs(dx) > threshold) goTo(dx > 0 ? idxRef.current + 1 : idxRef.current - 1);
      }
      axis.current = null;
      setIsTouching(false);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images.length]);

  const transitionStyle = isTouching ? 'none' : 'transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)';
  const dragPercent = width > 0 ? (offset / width) * 100 : 0;
  const totalOffset = -idx * 100 + dragPercent;

  return (
    <div
      ref={attachContainer}
      className="relative aspect-[16/10] overflow-hidden bg-gray-100 select-none group"
      onMouseEnter={() => { setIsHovered(true); updateWidth(); }}
      onMouseLeave={() => setIsHovered(false)}
      style={{ touchAction: 'pan-y' }}
    >
      {!hasPhotos && <NoPhotoPlaceholder />}
      {/* Sliding track */}
      <div
        className="flex h-full"
        style={{ transform: `translateX(${totalOffset}%)`, transition: transitionStyle, willChange: isTouching || isHovered ? 'transform' : undefined }}
      >
        {images.map((src, i) => (
          <div key={i} className="w-full h-full flex-shrink-0 flex items-center justify-center">
            {loadedPhotos.has(i) && <img
              src={src}
              // Фотографии объекта это не декор: по ним идёт трафик из поиска по
              // картинкам, и их же читает вслух скринридер. Если подписи нет,
              // оставляем пустую строку: корректная разметка для декоративного
              // изображения, тогда как alt="фото" был бы шумом.
              alt={alt ? tx("{0}, фото {1}", { "0": alt, "1": i + 1 }) : ''}
              loading={priority && i === 0 ? 'eager' : 'lazy'}
              fetchPriority={priority && i === 0 ? 'high' : 'auto'}
              decoding="async"
              className="w-full h-full object-cover pointer-events-none"
              draggable={false}
              onError={(e) => {
                const img = e.currentTarget;
                if (img.dataset.fallback === originals[i]) return;
                img.dataset.fallback = originals[i];
                img.src = originals[i];
              }}
            />}
          </div>
        ))}
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />

      {/* Nav arrows — visible on hover (PC) */}
      {images.length > 1 && (
        <>
          <button
            type="button"
            aria-label={tx("Предыдущее фото")}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); goTo(idx - 1); }}
            className={`absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white/80 backdrop-blur flex items-center justify-center shadow-md z-20 hover:bg-white active:scale-95 transition-all ${isHovered ? 'opacity-100' : 'opacity-0'}`}
          >
            <ChevronLeft className="w-4 h-4 text-gray-700" />
          </button>
          <button
            type="button"
            aria-label={tx("Следующее фото")}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); goTo(idx + 1); }}
            className={`absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white/80 backdrop-blur flex items-center justify-center shadow-md z-20 hover:bg-white active:scale-95 transition-all ${isHovered ? 'opacity-100' : 'opacity-0'}`}
          >
            <ChevronRight className="w-4 h-4 text-gray-700" />
          </button>
        </>
      )}

      {/* Dots — hovering across them pages through photos, click also works.
          A padded row (not just the tiny visible dot) makes hover easy to hit. */}
      {/**
       * Точки — КРУГЛЫЕ, а не пилюли.
       *
       * Активная была вдвое шире остальных (`w-3` при `h-1.5`) и на карточке с
       * десятком фотографий читалась как случайная белая полоска, выбившаяся из
       * ряда. Теперь все точки одного круглого размера, активная отличается
       * заливкой и лёгким увеличением — ряд остаётся ровным.
       *
       * Длинный ряд тоже правим: у объекта бывает и двадцать фотографий, а
       * двадцать точек под карточкой — это уже не подсказка, а забор. Показываем
       * не больше семи, окном вокруг текущей.
       */}
      {images.length > 1 && (
        <div className="absolute bottom-0 inset-x-0 flex justify-center items-center z-20 pb-2 pt-3">
          {images.map((_, d) => {
            const MAX_DOTS = 7;
            if (images.length > MAX_DOTS) {
              const half = Math.floor(MAX_DOTS / 2);
              const start = Math.min(Math.max(idx - half, 0), images.length - MAX_DOTS);
              if (d < start || d >= start + MAX_DOTS) return null;
            }
            const active = d === idx;
            return (
              <button
                key={d}
                type="button"
                aria-label={tx("Фото {0}", { "0": d + 1 })}
                aria-current={active || undefined}
                onMouseEnter={() => goTo(d)}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); goTo(d); }}
                className="flex h-6 w-6 items-center justify-center"
              >
                <span
                  className={`block rounded-full transition-all ${
                    active ? 'bg-white w-2 h-2 shadow-sm' : 'bg-white/45 w-1.5 h-1.5 hover:bg-white/70'
                  }`}
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
