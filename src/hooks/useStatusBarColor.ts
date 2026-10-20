import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// Keeps the browser/PWA status-bar tint (theme-color) in step with the colour
// at the very top of the current screen, instead of a single fixed green:
//   • Home, scrolled to the top → deep green (the dark hero sits behind the bar)
//   • everywhere else / scrolled → white (matches the light glass header)
// Android and desktop Chrome recolour their status/title bar from this; iOS
// uses the `default` status-bar style (dark icons) that stays legible either way.
const HOME_TOP = '#0f2e22';
const LIGHT = '#ffffff';

export function useStatusBarColor() {
  const { pathname } = useLocation();

  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) return;

    const isHome = pathname === '/';
    const apply = () => {
      const dark = isHome && window.scrollY < 40;
      meta.setAttribute('content', dark ? HOME_TOP : LIGHT);
    };
    apply();

    // Only the home hero flips colour on scroll; other routes are light throughout.
    if (!isHome) return;
    window.addEventListener('scroll', apply, { passive: true });
    return () => window.removeEventListener('scroll', apply);
  }, [pathname]);
}
