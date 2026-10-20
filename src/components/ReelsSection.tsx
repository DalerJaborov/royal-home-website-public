import { useLocale } from '@/hooks/useLocale';
import { useBrowserCapability } from '@/hooks/useBrowserCapability';
import { useEffect, useRef, useState } from 'react';
import Reveal from '@/components/Reveal';
import DeferredImage from '@/components/DeferredImage';
import { ChevronLeft, ChevronRight, Play, X } from 'lucide-react';
import { useCms, type ReelItem } from '@/contexts/CmsContext';
import { trpc } from '@/providers/trpc';

// Live items (real Graph API sync) use a string id and carry an extra videoUrl
// the admin-curated fallback items (ReelItem, numeric id) never have — this
// shape covers both without importing the server-side LiveReel type.
type ReelCard = Omit<ReelItem, 'id'> & { id: string | number; videoUrl?: string; fullCaption?: string; originalCover?: string };

const InstagramIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24">
    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
  </svg>
);

/**
 * Instagram/Reels strip for the home page (aura.tj-style): vertical 9:16
 * cards that open the agency's reels on Instagram. Content is CMS-driven
 * (cms.reels) — the admin swaps covers, captions and links.
 *
 * Swipeable on touch (native scroll) and click-and-drag on desktop mouse —
 * a small drag-distance guard keeps a plain click still opening the reel.
 */
export default function ReelsSection() {
  const { text: tx } = useLocale();
  const { cms } = useCms();
  const reels = cms.reels;
  const scrollRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const [seen, setInView] = useState(false);
  const fallback = useBrowserCapability(() => typeof IntersectionObserver === 'undefined');
  const inView = seen || fallback;
  const [isDragging, setIsDragging] = useState(false);
  const dragState = useRef({ startX: 0, startScroll: 0, moved: 0 });

  // Live reels come straight from the agency's actual Instagram (server-side
  // Graph API sync, refreshed periodically) — when configured, the strip
  // updates itself the same way the real Instagram feed does. Until then
  // (or if the sync ever comes back empty), it falls back to the covers and
  // links the admin curates by hand in Настройки сайта.
  const liveQuery = trpc.instagram.getReels.useQuery(undefined, {
    staleTime: 10 * 60 * 1000,
    retry: false,
    enabled: reels.enabled && inView,
  });
  const isLive = Array.isArray(liveQuery.data) && liveQuery.data.length > 0;
  const items: ReelCard[] = isLive ? liveQuery.data! : reels.items;
  useEffect(() => {
    const section = sectionRef.current;
    if (!section || inView || !reels.enabled || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      setInView(true);
      observer.disconnect();
    }, { rootMargin: '500px' });
    observer.observe(section);
    return () => observer.disconnect();
  }, [inView, reels.enabled, items.length]);
  const [openReel, setOpenReel] = useState<ReelCard | null>(null);
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const caption = openReel ? openReel.fullCaption || openReel.caption : '';
  // Порог на глаз: две строки этой ширины вмещают примерно столько символов,
  // и показывать «Ещё» под текстом, который и так виден целиком, незачем.
  const isLongCaption = caption.length > 90 || caption.includes('\n');

  // Esc closes the lightbox; body scroll is locked while it's open.
  // Описание сворачивается при каждом открытии: развёрнутый текст от прошлого
  // ролика перекрывал бы начало следующего.
  useEffect(() => {
    if (!openReel) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpenReel(null);
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [openReel]);

  if (!reels.enabled) return null;
  if (items.length === 0) return <section ref={sectionRef} aria-hidden="true" />;

  const scrollBy = (dir: number) =>
    scrollRef.current?.scrollBy({ left: dir * scrollRef.current.clientWidth * 0.8, behavior: 'smooth' });

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!scrollRef.current) return;
    setIsDragging(true);
    dragState.current = { startX: e.clientX, startScroll: scrollRef.current.scrollLeft, moved: 0 };
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !scrollRef.current) return;
    const dx = e.clientX - dragState.current.startX;
    dragState.current.moved = Math.max(dragState.current.moved, Math.abs(dx));
    scrollRef.current.scrollLeft = dragState.current.startScroll - dx;
  };
  const endDrag = () => setIsDragging(false);
  // A card click right after a real drag would navigate away unintentionally.
  // Cards with a real video file (live Reels only) open inline instead of
  // sending the visitor to Instagram; curated fallback cards (no videoUrl)
  // keep the old "open the post on Instagram" behaviour.
  const handleCardClick = (e: React.MouseEvent, reel: ReelCard) => {
    if (dragState.current.moved > 6) {
      e.preventDefault();
      return;
    }
    if (reel.videoUrl) {
      e.preventDefault();
      setCaptionExpanded(false);
      setOpenReel(reel);
    }
  };

  return (
    <section ref={sectionRef} className="py-12 bg-white">
      <div className="section-padding">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
              <InstagramIcon className="w-6 h-6 text-emerald-800" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <Reveal
                  as="h2"
                  x={-20}
                  y={0}
                  className="text-2xl lg:text-3xl font-bold text-gray-900 leading-tight"
                >
                  {tx(reels.title)}
                </Reveal>
                {isLive && (
                  <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 text-[11px] font-bold">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                     {tx("Прямо из Instagram")} </span>
                )}
              </div>
              <p className="text-xs sm:text-sm text-gray-500">{tx(reels.subtitle)}</p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-2">
            <button
              aria-label={tx("Назад")}
              onClick={() => scrollBy(-1)}
              className="w-9 h-9 rounded-full border border-gray-200 bg-white flex items-center justify-center hover:bg-gray-50 hover:border-gray-300 transition-colors"
            ><ChevronLeft className="w-4 h-4 text-gray-600" /></button>
            <button
              aria-label={tx("Вперёд")}
              onClick={() => scrollBy(1)}
              className="w-9 h-9 rounded-full border border-gray-200 bg-white flex items-center justify-center hover:bg-gray-50 hover:border-gray-300 transition-colors"
            ><ChevronRight className="w-4 h-4 text-gray-600" /></button>
          </div>
        </div>

        <div
          ref={scrollRef}
          className={`flex gap-3 sm:gap-4 overflow-x-auto overscroll-x-contain snap-x snap-mandatory scrollbar-hide pb-2 -mx-1 px-1 ${isDragging ? 'cursor-grabbing select-none' : 'cursor-grab'}`}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={endDrag}
          onMouseLeave={endDrag}
          style={{ scrollSnapType: isDragging ? 'none' : undefined }}
        >
          {items.map((reel, i) => (
            <Reveal
              as="a"
              key={reel.id}
              href={reel.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e: React.MouseEvent) => handleCardClick(e, reel)}
              onDragStart={(e: React.DragEvent) => e.preventDefault()}
              className="relative flex-shrink-0 snap-start w-[42%] sm:w-[30%] md:w-[22%] lg:w-[calc(16.666%-14px)] aspect-[9/16] rounded-2xl overflow-hidden group bg-gray-100"
              y={0}
              delay={i * 0.06}
            >
              <DeferredImage
                src={reel.cover}
                alt={tx(reel.caption)}
                loading="eager"
                draggable={false}
                className="w-full h-full object-cover pointer-events-none"
                onError={(event) => {
                  const image = event.currentTarget;
                  if (!reel.originalCover || image.dataset.fallback === reel.originalCover) return;
                  image.dataset.fallback = reel.originalCover;
                  image.src = reel.originalCover;
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-black/20" />
              {/* Play badge */}
              <div className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center">
                <Play className="w-4 h-4 text-white fill-white" />
              </div>
              {/* Caption */}
              <div className="absolute bottom-0 inset-x-0 p-3">
                <p className="text-white text-xs sm:text-sm font-semibold leading-snug line-clamp-2">{tx(reel.caption)}</p>
                <p className="text-white/60 text-[10px] mt-1">{tx(reels.handle)}</p>
              </div>
            </Reveal>
          ))}
        </div>

        <div className="text-center mt-6">
          <a
            href={reels.profileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-royal inline-flex items-center gap-2.5 px-7 py-3 rounded-xl font-bold text-sm"
          >
            <InstagramIcon className="w-[18px] h-[18px]" />
             {tx("Смотреть все видео в Instagram")} </a>
        </div>
      </div>

      {openReel && (
        <div
          className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setOpenReel(null)}
        >
          <button
            aria-label={tx("Закрыть")}
            onClick={() => setOpenReel(null)}
            className="absolute top-4 right-4 sm:top-6 sm:right-6 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          {/* Текст поста лежит ПОВЕРХ видео, как в самом Instagram. Отдельной
              панелью под плеером он на телефоне уезжал за нижний край экрана:
              высоту забирало вертикальное видео 9:16, и читать описание было
              невозможно. Свёрнутый вид занимает две строки, разворачивается по
              «ещё» в прокручиваемый блок, не перекрывая элементы управления. */}
          <div
            className="relative w-full max-w-[380px] max-h-[88vh] aspect-[9/16] rounded-2xl overflow-hidden bg-black shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <video
              key={openReel.id}
              src={openReel.videoUrl}
              poster={openReel.cover}
              controls
              autoPlay
              playsInline
              className="w-full h-full object-contain"
            />
            {caption && (
              // pointer-events-none на подложке: градиент широкий, и без этого он
              // съедал бы касания по видео. Клики принимает только сам текст.
              <div className="absolute inset-x-0 bottom-0 pointer-events-none">
                <div className="bg-gradient-to-t from-black via-black/75 to-transparent pt-12 pb-14 px-4">
                  <div className="pointer-events-auto">
                    <p
                      className={`text-white text-[13px] sm:text-sm leading-relaxed whitespace-pre-wrap ${
                        captionExpanded ? 'max-h-[34vh] overflow-y-auto pr-1' : 'line-clamp-2'
                      }`}
                    >
                      {tx(caption)}
                    </p>
                    {isLongCaption && (
                      <button
                        type="button"
                        onClick={() => setCaptionExpanded((v) => !v)}
                        className="mt-1.5 text-white/80 hover:text-white text-xs font-semibold"
                      >
                        {captionExpanded ? tx("Свернуть") : tx("Ещё")}
                      </button>
                    )}
                    <p className="text-white/60 text-[10px] mt-2">{tx(reels.handle)}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
