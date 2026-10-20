import { expect, it } from 'vitest';
import { catalogModulePreloads } from './catalog-module-preloads';
const manifest = {
  'src/pages/Home.tsx': { file: 'assets/Home-123.js', imports: ['react', 'home-service'] },
  'home-service': { file: 'assets/HomeService-123.js', css: ['assets/HomeService-123.css'] },
  'src/pages/ListingsPage.tsx': { file: 'assets/ListingsPage-123.js', imports: ['motion', 'react'] },
  motion: { file: 'assets/motion-123.js', imports: ['react'] },
  react: { file: 'assets/vendor-react-123.js' },
  'src/pages/AdminLeadsPage.tsx': { file: 'assets/admin-123.js', css: ['assets/admin-123.css'] },
};
it('provides lazy home section layout before hydration without fetching its JavaScript', () => {
  const eagerHome = {
    'src/components/HomeServices.tsx': { file: 'assets/HomeServices-lazy.js', imports: ['service-design'] },
    'service-design': { file: 'assets/ServiceDesign-lazy.js', css: ['assets/ServiceDesign.css'] },
  };
  const result = catalogModulePreloads('/', eagerHome, '<div data-public-ssr="true"></div>');
  expect(result).toBe('<link rel="stylesheet" href="/assets/ServiceDesign.css">');
  expect(catalogModulePreloads('/', eagerHome, '<div id="root"></div>')).toBe('');
});
it('lets complete catalogue HTML paint before its hydration modules compete for bandwidth', () => {
  expect(catalogModulePreloads('/listings', manifest, '<div data-public-ssr="true"></div>')).toBe('');
});
it('preloads catalogue dependencies once, preserving existing entry preloads in every locale', () => {
  for (const path of ['/listings', '/tg/khonaho-dushanbe', '/en/listings?rooms=2']) {
    const result = catalogModulePreloads(path, manifest, '<link href="/assets/vendor-react-123.js">');
    expect(result).toContain('ListingsPage-123.js'); expect(result).toContain('motion-123.js');
    expect(result).toContain('fetchpriority="low"');
    expect(result).not.toContain('vendor-react'); expect(result).not.toContain('admin');
  }
});
it('preloads the home route in every locale without downloading catalogue or admin modules', () => {
  for (const path of ['/', '/tg', '/en?utm_source=campaign']) {
    const result = catalogModulePreloads(path, manifest, '<link href="/assets/vendor-react-123.js">');
    expect(result).toContain('Home-123.js');
    expect(result).toContain('<link rel="stylesheet" href="/assets/HomeService-123.css">');
    expect(result).not.toMatch(/ListingsPage|admin|vendor-react/);
  }
});
it('avoids duplicate and unsafe stylesheet hints', () => {
  expect(catalogModulePreloads('/', manifest, '<style data-public-stylesheet="/assets/HomeService-123.css">body{}</style>')).not.toContain('HomeService-123.css');
  expect(catalogModulePreloads('/', manifest, '<link href="/assets/HomeService-123.css">')).not.toContain('HomeService-123.css');
  expect(catalogModulePreloads('/', {'src/pages/Home.tsx':{file:'assets/Home.js',css:['https://foreign.example/site.css','assets/evil".css','../secret.css']}},'')).not.toContain('stylesheet');
});
it('keeps services and unknown paths free of home/catalogue code', () => {
  for (const path of ['/services', '/tg/khizmatrasoni', '/unknown']) expect(catalogModulePreloads(path, manifest, '')).toBe('');
  expect(catalogModulePreloads('/listings', {}, '')).toBe('');
});
