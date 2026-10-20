// True only when running as an installed PWA (standalone display mode),
// not a regular browser tab — gates PWA-only touches like the swipe-back
// gesture and the dock-magnify bottom nav.
export function isStandalonePwa() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}
