import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import CardPhotoCarousel from './CardPhotoCarousel';
import ThumbnailImage from './ThumbnailImage';
import { SwipeableGallery } from '@/pages/ListingDetailPage';

describe('image loading without losing catalog navigation', () => {
  it('does not fetch all twenty photos before the user opens their slides', () => {
    const photos = Array.from({ length: 20 }, (_, index) => `/uploads/photo-${index}.webp`);
    const html = renderToStaticMarkup(createElement(CardPhotoCarousel, { photos, alt: 'Квартира в Душанбе' }));
    expect(html.match(/<img\b/g)).toHaveLength(1);
    expect(html).toContain('/uploads/thumbs/photo-0.webp');
    expect(html).not.toContain('/uploads/thumbs/photo-19.webp');
    expect(html).not.toContain('/uploads/thumbs/photo-1.webp');
    expect(html).toContain('Следующее фото');
    expect(html.match(/aria-label="Фото \d+"/g)).toHaveLength(7);
  });

  it('uses CRM thumbnails while retaining static brand assets', () => {
    expect(renderToStaticMarkup(createElement(ThumbnailImage, { src: 'https://crm.royalhome.tj/uploads/a.webp', alt: 'Объект' })))
      .toContain('src="https://crm.royalhome.tj/uploads/thumbs/a.webp"');
    expect(renderToStaticMarkup(createElement(ThumbnailImage, { src: '/images/brand.webp', alt: '' })))
      .toContain('src="/images/brand.webp"');
  });

  it('keeps all detail thumbnail controls with only two initially mounted full photos', () => {
    const photos = Array.from({ length: 7 }, (_, index) => `/uploads/detail-${index}.webp`);
    const html = renderToStaticMarkup(createElement(SwipeableGallery, { images: photos }));
    const fullImages = (html.match(/<img\b[^>]*>/g) ?? []).filter(image => /src="\/uploads\/detail-/.test(image));
    expect(fullImages).toHaveLength(2);
    expect(fullImages[0]).toContain('fetchPriority="high"');
    expect(fullImages[0]).toContain('loading="eager"');
    expect(fullImages[0]).toContain('width="1200" height="900"');
    const thumbnails = (html.match(/<img\b[^>]*>/g) ?? []).filter(image => image.includes('/uploads/thumbs/'));
    expect(thumbnails).toHaveLength(7);
    expect(thumbnails.every(image => image.includes('loading="lazy"') && image.includes('fetchPriority="low"'))).toBe(true);
    expect(html).toContain('Миниатюра 7');
    expect(html).toContain('Следующее фото');
  });

  it('prioritizes only the catalog cover and leaves ordinary homepage galleries lazy', () => {
    const photos = ['/uploads/cover.webp', '/uploads/second.webp', '/uploads/third.webp'];
    const catalogHtml = renderToStaticMarkup(createElement(CardPhotoCarousel, { photos, priority: true }));
    const catalogImages = catalogHtml.match(/<img\b[^>]*>/g)!;
    expect(catalogImages[0]).toContain('loading="eager"');
    expect(catalogImages[0]).toContain('fetchPriority="high"');
    expect(catalogImages).toHaveLength(1);
    expect(catalogHtml).not.toContain('src="/uploads/thumbs/second.webp"');
    const homepageHtml = renderToStaticMarkup(createElement(CardPhotoCarousel, { photos }));
    expect(homepageHtml).not.toContain('loading="eager"');
    expect(homepageHtml).not.toContain('fetchPriority="high"');
  });
});

describe('self-hosted fonts', () => {
  const root = path.resolve(import.meta.dirname, '../..');
  const css = readFileSync(path.join(root, 'public/fonts.css'), 'utf8');
  const rules = [...css.matchAll(/@font-face\s*\{[^}]*\}/g)].map(([rule]) => rule);
  const sourceUrls = [...css.matchAll(/url\((\/fonts\/[^)]+)\)/g)].map((match) => match[1]);

  it('shares repeated binaries while keeping every weight and Tajik glyph subset', () => {
    expect(rules).toHaveLength(35);
    expect(new Set(sourceUrls).size).toBe(6);
    for (const family of ['Inter', 'Unbounded']) {
      const faces = rules.filter((rule) => rule.includes(`font-family: '${family}'`));
      expect(faces.some((rule) => rule.includes('U+0460-052F'))).toBe(true);
      const weights = new Set(faces.map((rule) => /font-weight:\s*(\d+)/.exec(rule)?.[1]));
      expect([...weights].sort()).toEqual(family === 'Inter'
        ? ['300', '400', '500', '600', '700']
        : ['400', '500', '600', '700', '800', '900']);
    }
    expect(css).toContain('size-adjust: 107.12%');
    expect(css).toContain('size-adjust: 137.63%');
  });

  it('preloads only shared font URLs that exist and are used by font-face', () => {
    const index = readFileSync(path.join(root, 'index.html'), 'utf8');
    const preloads = [...index.matchAll(/<link rel="preload" as="font"[^>]+href="([^"]+)"/g)].map((match) => match[1]);
    expect(preloads).toEqual(['/fonts/unbounded-700-cyrillic.woff2']);
    for (const url of preloads) {
      expect(sourceUrls).toContain(url);
      expect(readFileSync(path.join(root, 'public', url)).length).toBeGreaterThan(0);
    }
  });
});
