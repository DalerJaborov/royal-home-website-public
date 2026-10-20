/** Shared selection ensures the browser consumes exactly the SSR preload. */
export const HERO_BG_PHOTOS = [
  { id: 1, src: '/images/banners/hero-new.webp', label: 'Интерьер на закате', w: 1564 },
  { id: 2, src: '/images/banners/dushanbe-cta.webp', label: 'Душанбе на закате', w: 1344 },
  { id: 3, src: '/images/apartments/apt1.webp', label: 'Апартаменты', w: 900 },
  { id: 4, src: '/images/apartments/apt2.webp', label: 'Интерьер', w: 900 },
] as const;
export const HERO_VARIANT_WIDTHS = [768, 1280];
export function heroSrcSet(src: string, width: number): string {
  return [...HERO_VARIANT_WIDTHS.filter(value => value < width).map(value => `${src.replace(/\.webp$/, `-${value}.webp`)} ${value}w`), `${src} ${width}w`].join(', ');
}

export function resolveHeroImage(value: unknown): { src: string; srcSet?: string } | null {
  if (!value || typeof value !== 'object') return null;
  const settings = value as { variant?: string; usePhoto?: boolean; bgPhoto?: number; bgImage?: string };
  if (settings.variant === 'flat-brand') return null;
  const photoVariant = settings.variant === 'photo-cards' || settings.variant === 'photo-clean';
  // Modern variants are authoritative; usePhoto predates the current editor.
  if (!photoVariant && settings.usePhoto !== true) return null;
  const custom = typeof settings.bgImage === 'string' ? settings.bgImage.trim() : '';
  if (custom && (/^\/(?!\/)/.test(custom) || /^https?:\/\//i.test(custom))) return { src: custom };
  const photo = HERO_BG_PHOTOS.find(item => item.id === settings.bgPhoto) ?? HERO_BG_PHOTOS[0];
  return { src: photo.src, srcSet: heroSrcSet(photo.src, photo.w) };
}
