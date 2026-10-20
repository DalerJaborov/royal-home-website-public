import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { isStandalonePwa } from '@/lib/pwaEnv';

// Native-feeling "swipe from the left edge to go back", active only inside
// the installed PWA (a regular browser tab already has this via the OS/
// browser chrome). Drags #root with the finger and commits to
// history.back() past a threshold, mirroring iOS's edge-swipe-pop and
// Android's gesture-nav back animation instead of the instant, jarring
// history change either OS falls back to inside a bare web app shell.
const EDGE_ZONE_PX = 24;
const COMMIT_DISTANCE_PX = 90;
const MAX_VERTICAL_DRIFT_PX = 60;

export function useSwipeBackGesture() {
  const { pathname } = useLocation();

  useEffect(() => {
    if (!isStandalonePwa()) return;
    if (pathname === '/' || window.history.length <= 1) return;

    const root = document.getElementById('root');
    if (!root) return;

    let tracking = false;
    let decided = false;
    let startX = 0;
    let startY = 0;
    let dx = 0;

    const reset = (animate: boolean) => {
      root.style.transition = animate ? 'transform 0.22s ease-out, opacity 0.22s ease-out' : '';
      root.style.transform = '';
      root.style.opacity = '';
      tracking = false;
      decided = false;
    };

    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (t.clientX > EDGE_ZONE_PX) return;
      tracking = true;
      decided = false;
      startX = t.clientX;
      startY = t.clientY;
      dx = 0;
      root.style.transition = '';
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!tracking) return;
      const t = e.touches[0];
      dx = t.clientX - startX;
      const dy = t.clientY - startY;

      if (!decided) {
        // Wait for unambiguous intent before committing either way — a
        // vertical scroll's very first pixels are often slightly diagonal,
        // so judging on dx alone (without comparing it to dy) could
        // misfire as a back-swipe and swallow the scroll via preventDefault.
        if (Math.abs(dx) < 12 && Math.abs(dy) < 12) return;
        if (dx > 12 && dx > Math.abs(dy) * 1.5) {
          decided = true;
        } else {
          // Vertical (or ambiguous) — hand the gesture back to native scroll.
          tracking = false;
          return;
        }
      }

      if (decided && dx > 0 && Math.abs(dy) < MAX_VERTICAL_DRIFT_PX) {
        e.preventDefault();
        const progress = Math.min(1, dx / window.innerWidth);
        root.style.transform = `translateX(${dx}px)`;
        root.style.opacity = String(1 - progress * 0.25);
      }
    };

    const onTouchEnd = () => {
      if (!tracking || !decided) {
        reset(false);
        return;
      }
      if (dx > COMMIT_DISTANCE_PX) {
        root.style.transition = 'transform 0.18s ease-in, opacity 0.18s ease-in';
        root.style.transform = `translateX(${window.innerWidth}px)`;
        root.style.opacity = '0.6';
        window.setTimeout(() => {
          window.history.back();
          reset(false);
        }, 160);
      } else {
        reset(true);
      }
    };

    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd, { passive: true });
    document.addEventListener('touchcancel', onTouchEnd, { passive: true });

    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
      document.removeEventListener('touchcancel', onTouchEnd);
      reset(false);
    };
  }, [pathname]);
}
