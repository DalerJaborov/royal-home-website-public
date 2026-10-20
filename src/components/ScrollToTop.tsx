import { useLocale } from '@/hooks/useLocale';
import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
import { ArrowUp } from 'lucide-react';

export default function ScrollToTop() {
  const { text: tx, basePath } = useLocale();
  const location = useLocation();
  const navType = useNavigationType(); // 'PUSH' | 'REPLACE' | 'POP'
  const [visible, setVisible] = useState(false);

  // Remembered scroll position per history entry so that going Back/Forward
  // returns to exactly where the user was, instead of snapping to the top.
  // Keyed by location.key (unique per history entry). Without this, tapping a
  // listing and coming back dumped you at the top of the list — the "jumps to
  // another place" complaint.
  const positions = useRef<Map<string, number>>(new Map());
  const prevKey = useRef(location.key);

  // On navigation: stash where the outgoing page was scrolled to, then restore
  // the saved position for Back/Forward (POP) or go to the top for a fresh
  // page (PUSH/REPLACE). Stashing here (not via a continuous scroll listener)
  // matters: a listener would also catch our own programmatic reset below and
  // overwrite the outgoing entry's position with 0. useLayoutEffect so it
  // lands before paint — no visible jump.
  useLayoutEffect(() => {
    // The DOM has already swapped to the new route, but the viewport hasn't
    // moved yet — window.scrollY still holds the outgoing page's position.
    positions.current.set(prevKey.current, window.scrollY);
    prevKey.current = location.key;
    // behavior:'instant' is mandatory: html has `scroll-behavior: smooth`, and a
    // plain scrollTo() inherits it — the smooth animation gets cancelled by the
    // route's content swap, so the page visibly never resets to the top.
    if (navType === 'POP') {
      // Catalog restores its saved batch and scroll after the async rows mount.
      if (basePath === '/listings') return;
      const saved = positions.current.get(location.key);
      window.scrollTo({ top: saved ?? 0, behavior: 'instant' });
    } else {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);

  // Show/hide the "back to top" button based on scroll position. Sentinel +
  // IntersectionObserver in addition to the scroll listener — scroll events
  // alone proved unreliable in some embedded browsers.
  useEffect(() => {
    const sentinel = document.createElement('div');
    sentinel.style.cssText = 'position:absolute;top:0;left:0;height:300px;width:1px;pointer-events:none;visibility:hidden;';
    document.body.prepend(sentinel);
    const io = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(([entry]) => setVisible(!entry.isIntersecting));
    io?.observe(sentinel);

    const onScroll = () => setVisible(window.scrollY > 300);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener('scroll', onScroll);
      io?.disconnect();
      sentinel.remove();
    };
  }, []);

  const handleClick = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Кнопка «наверх» временно отключена по просьбе — сам сброс скролла при
  // смене страницы (эффект выше) продолжает работать как обычно.
  const BUTTON_DISABLED = true;
  if (BUTTON_DISABLED) return null;

  return (
    <button
      onClick={handleClick}
      // left-6, not right-6: the chat widget (src/components/ChatWidget.tsx)
      // is fixed to the bottom-right corner on every page — sharing that
      // corner made the two controls visually collide/overlap.
      className={`fixed bottom-6 left-6 z-40 bg-gray-900/40 backdrop-blur-md rounded-full p-3 border border-white/40 shadow-[0_4px_20px_rgba(0,0,0,0.35)] transition-all duration-300 hover:scale-110 hover:bg-gray-900/55 focus:outline-none focus:ring-2 focus:ring-white/50 ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
      }`}
      aria-label={tx("Наверх")}
    >
      {/* A tinted-dark glass disc (not mix-blend, which read as invisible
          over busy photo backgrounds) keeps the white arrow legible over
          light sections, dark sections, and photos alike. */}
      <ArrowUp className="w-5 h-5 text-white" />
    </button>
  );
}
