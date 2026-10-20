import { expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import DeferredImage from './components/DeferredImage';

it('defers responsive candidates as well as src before intersection, retaining dimensions and alt', () => {
  const html = renderToString(createElement(DeferredImage, { src: '/image-960.webp', srcSet: '/image-480.webp 480w, /image-960.webp 960w', alt: 'Иллюстрация', width: 480, height: 320 }));
  expect(html).not.toContain('src=');
  expect(html).not.toContain('srcSet=');
  expect(html).toContain('alt="Иллюстрация"');
  expect(html).toContain('width="480" height="320"');
});
