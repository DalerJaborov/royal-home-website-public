export type GallerySlide =
  | { kind: 'photo'; src: string; photoNumber: number }
  | { kind: 'video'; src: string };

/**
 * Порядок слайдов галереи объекта: фото 1, ролик, фото 2…
 * Ролик всегда вторым — после первого фото; если фото одно, он следом за ним,
 * если фото нет вовсе, ролик единственный слайд. photoNumber — номер фото
 * среди одних только фото (для подписей «Фото N»), он не сдвигается из-за ролика.
 */
export function buildGallerySlides(images: readonly string[], videoUrl?: string | null): GallerySlide[] {
  const photos: GallerySlide[] = images.map((src, i) => ({ kind: 'photo', src, photoNumber: i + 1 }));
  if (!videoUrl) return photos;
  const video: GallerySlide = { kind: 'video', src: videoUrl };
  return [...photos.slice(0, 1), video, ...photos.slice(1)];
}
