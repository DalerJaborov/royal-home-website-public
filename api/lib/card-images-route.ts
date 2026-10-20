import { Hono } from 'hono';
import { getCardImage, type CardImageLayout } from './card-images';

export function createCardImagesApp(service = getCardImage, layout: CardImageLayout = 'full') {
  const app = new Hono();
  app.get('/:filename', async c => {
    const image = await service(c.req.param('filename'), layout);
    if (image.status !== 200) {
      c.header('Cache-Control', 'no-store');
      if (image.status === 503) c.header('Retry-After', '30');
      return c.text(image.status === 404 ? 'Not Found' : 'Image unavailable', image.status);
    }
    c.header('Content-Type', 'image/webp');
    c.header('Cache-Control', 'public, max-age=2592000, immutable');
    c.header('ETag', image.etag);
    const validators = c.req.header('If-None-Match')?.split(',').map(value => value.trim());
    if (validators?.some(value => value === '*' || value.replace(/^W\//, '') === image.etag)) return c.body(null, 304);
    if (c.req.method === 'HEAD') return c.body(null, 200);
    return c.body(new Uint8Array(image.bytes), 200);
  });
  return app;
}
