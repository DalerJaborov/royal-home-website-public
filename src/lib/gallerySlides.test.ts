import { describe, expect, it } from 'vitest';
import { buildGallerySlides } from './gallerySlides';

const kinds = (slides: ReturnType<typeof buildGallerySlides>) =>
  slides.map(slide => (slide.kind === 'photo' ? `p${slide.photoNumber}` : 'video'));

describe('buildGallerySlides', () => {
  it('puts the video second: photo 1, video, photo 2…', () => {
    expect(kinds(buildGallerySlides(['/a.webp', '/b.webp', '/c.webp'], 'https://crm.royalhome.tj/v.mp4')))
      .toEqual(['p1', 'video', 'p2', 'p3']);
  });

  it('puts the video right after a lone photo', () => {
    expect(kinds(buildGallerySlides(['/a.webp'], 'https://crm.royalhome.tj/v.mp4'))).toEqual(['p1', 'video']);
  });

  it('puts the video first when there are no photos', () => {
    expect(kinds(buildGallerySlides([], 'https://crm.royalhome.tj/v.mp4'))).toEqual(['video']);
  });

  it('keeps photos untouched without a video', () => {
    expect(kinds(buildGallerySlides(['/a.webp', '/b.webp'], null))).toEqual(['p1', 'p2']);
    expect(kinds(buildGallerySlides(['/a.webp'], undefined))).toEqual(['p1']);
    expect(buildGallerySlides([], null)).toEqual([]);
  });
});
