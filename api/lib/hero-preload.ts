import { resolveHeroImage } from '@contracts/hero-image';
import { resolvePublicPath } from '@contracts/public-i18n';

function attribute(value: string): string { return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!); }
export function heroPreloadForPath(path: string, settings: unknown): string {
  if (resolvePublicPath(path).basePath !== '/') return '';
  const image = resolveHeroImage(settings);
  if (!image) return '';
  return `<link rel="preload" as="image" href="${attribute(image.src)}"${image.srcSet ? ` imagesrcset="${attribute(image.srcSet)}" imagesizes="100vw"` : ''} fetchpriority="high" />`;
}
