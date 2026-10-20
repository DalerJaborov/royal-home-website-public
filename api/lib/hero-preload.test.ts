import { describe, expect, it } from 'vitest';
import { heroPreloadForPath } from './hero-preload';
import { resolveHeroImage } from '@contracts/hero-image';

describe('matching hero resource priority', () => {
  it('uses the actual selected image and responsive candidates on all home locales', () => {
    const settings = { variant: 'photo-cards', usePhoto: false, bgPhoto: 2 };
    const image = resolveHeroImage(settings)!;
    expect(image.src).toBe('/images/banners/dushanbe-cta.webp');
    for (const route of ['/', '/tg', '/en']) {
      const html = heroPreloadForPath(route, settings);
      expect(html).toContain(`href="${image.src}"`);
      expect(html).toContain(`imagesrcset="${image.srcSet}"`);
      expect(html).toContain('fetchpriority="high"');
    }
  });
  it('avoids hidden-photo downloads, missing settings and unrelated routes', () => {
    expect(resolveHeroImage({ variant: 'flat-brand', usePhoto: true })).toBeNull();
    expect(heroPreloadForPath('/', undefined)).toBe('');
    expect(heroPreloadForPath('/', { usePhoto: false })).toBe('');
    expect(heroPreloadForPath('/tg/services', { variant: 'photo-clean' })).toBe('');
  });
  it('does not fabricate nonexistent resized custom files and escapes preload attributes', () => {
    const settings = { variant: 'photo-clean', bgImage: '/uploads/custom.jpg?x=1&y=2' };
    expect(resolveHeroImage(settings)).toEqual({ src: settings.bgImage });
    const html = heroPreloadForPath('/en', settings);
    expect(html).toContain('custom.jpg?x=1&amp;y=2');
    expect(html).not.toContain('imagesrcset');
    expect(heroPreloadForPath('/', { variant: 'photo-clean', bgImage: 'javascript:alert(1)' })).not.toContain('javascript:');
  });
});
