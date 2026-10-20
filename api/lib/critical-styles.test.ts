import { expect, it } from 'vitest';
import { localStylesheetPath, prioritizeHeadingFont, prioritizeHomePaint } from './critical-styles';

it('lets server-rendered home text paint before hydration downloads in every language', () => {
  const html='<script type="module" crossorigin src="/assets/main-abc.js"></script><link rel="modulepreload" crossorigin href="/assets/react-abc.js" /><link rel="preload" as="font" href="/fonts/heading.woff2"><img src="/hero.webp" fetchpriority="high"><a href="/listings">Купить</a>';
  for(const path of ['/','/tg','/en?utm_source=test']) {
    const result=prioritizeHomePaint(html,path,true);
    expect(result).toContain('<script type="module" crossorigin src="/assets/main-abc.js" fetchpriority="low"></script>');
    expect(result).toContain('<link rel="modulepreload" crossorigin href="/assets/react-abc.js" fetchpriority="low">');
    expect(result).toContain('<link rel="preload" as="font" href="/fonts/heading.woff2">');
    expect(result).toContain('<img src="/hero.webp" fetchpriority="high"><a href="/listings">Купить</a>');
    expect(prioritizeHomePaint(result,path,true)).toBe(result);
  }
});
it('keeps fallback, catalogue and unrelated script priorities unchanged', () => {
  const html='<script type="module" src="/assets/main.js" fetchpriority="high"></script><script src="/tracker.js"></script><script type="module" src="https://other.test/app.js"></script>';
  for(const path of ['/listings','/tg/khonaho-dushanbe','/admin','/unknown']) expect(prioritizeHomePaint(html,path,true)).toBe(html);
  expect(prioritizeHomePaint(html,'/',false)).toBe(html);
  expect(prioritizeHomePaint(html,'/',true)).toBe(html.replace('fetchpriority="high"','fetchpriority="low"'));
});
it('inlines local versioned font CSS while refusing remote and traversal paths', () => {
  expect(localStylesheetPath('<link href="/fonts.css?v=abc" rel="stylesheet">')).toBe('/fonts.css');
  expect(localStylesheetPath('<link rel="stylesheet" href="/assets/index-abc.css">')).toBe('/assets/index-abc.css');
  for (const href of ['https://evil.test/fonts.css', '//evil.test/fonts.css', '/assets/../../private.css', '/secret.css']) expect(localStylesheetPath(`<link rel="stylesheet" href="${href}">`)).toBeUndefined();
});
it('prioritizes the actual heading font subset without changing the font files or stylesheet', () => {
  const html='<link rel="preload" as="font" href="/fonts/unbounded-700-cyrillic.woff2" crossorigin>';
  expect(prioritizeHeadingFont(html,'/en/listings')).toContain('unbounded-700-latin');
  expect(prioritizeHeadingFont(html,'/tg/khonaho-dushanbe')).toBe(html);
});
it('discovers the visible complete-page font faces in each language without duplicate or unused heading hints', () => {
  const template='<link rel="preload" as="font" type="font/woff2" href="/fonts/unbounded-700-cyrillic.woff2" crossorigin />';
  const faces = (path: string) => [...prioritizeHeadingFont(template,path,true).matchAll(/href="\/fonts\/([^"]+)"/g)].map(match=>match[1]);
  expect(faces('/')).toEqual(['inter-400-cyrillic.woff2','inter-400-latin-core-v1.woff2','unbounded-700-cyrillic.woff2','unbounded-700-latin-core-v1.woff2']);
  expect(faces('/tg')).toEqual(['inter-400-cyrillic.woff2','inter-400-cyrillic-ext.woff2','inter-400-latin-core-v1.woff2']);
  expect(faces('/en')).toEqual(['unbounded-700-latin-core-v1.woff2','inter-400-latin-core-v1.woff2']);
  expect(prioritizeHeadingFont(template,'/',true)).toContain('href="/fonts/unbounded-700-latin-core-v1.woff2" crossorigin fetchpriority="low"');
  expect(prioritizeHeadingFont(template,'/en',true)).not.toContain('fetchpriority="low"');
  expect(faces('/listings')).toEqual(['unbounded-700-cyrillic.woff2','unbounded-catalog-numerals-v1.woff2']);
  for(const path of ['/tg/khonaho-dushanbe','/en/listings']) expect(faces(path)).toEqual([]);
});
