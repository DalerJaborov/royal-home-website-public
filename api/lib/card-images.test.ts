import { describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { createCardImageService } from './card-images';
import { createCardImagesApp } from './card-images-route';
import { toCardImageUrl, toCatalogImageUrl, toThumbUrl } from '@contracts/image-urls';

const filename = 'f87386ef-2a61-4de8-bb53-3345dc912c07.webp';
const second = 'f84fd927-3a93-4c75-bc6d-f08402d8f173.webp';
const image = (bytes: Uint8Array) => new Response(bytes, { headers: { 'Content-Type': 'image/webp' } });

describe('bounded automatic card images', () => {
  it('uses the same public upload Host through the local gateway when enabled', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(image(new Uint8Array([1])));
    const convert = vi.fn(async () => Buffer.from('same-output'));
    const result = await createCardImageService({ fetch, convert, localSource: true })(filename, 'catalog');
    expect(result.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe('http://host.docker.internal/uploads/thumbs/'+filename);
    expect(fetch.mock.calls[0][1]).toMatchObject({ headers: { Host: 'royalhome.tj' }, redirect: 'error' });
    expect(convert).toHaveBeenCalledWith(Buffer.from([1]), 'catalog');
  });
  it.each(['network', 'server'])('retains the external source after a local %s failure', async failure => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    if (failure === 'network') fetch.mockRejectedValueOnce(new TypeError('Unavailable'));
    else fetch.mockResolvedValueOnce(new Response('Unavailable', { status: 503 }));
    fetch.mockResolvedValueOnce(image(new Uint8Array([1])));
    expect((await createCardImageService({ fetch, localSource: true, convert: async () => Buffer.from('ok') })(filename)).status).toBe(200);
    expect(fetch.mock.calls.map(call => call[0])).toEqual([
      'http://host.docker.internal/uploads/thumbs/'+filename,
      'https://royalhome.tj/uploads/thumbs/'+filename,
    ]);
    expect(fetch.mock.calls[1][1]?.headers).toBeUndefined();
  });
  it.each([401, 403])('does not retry or convert a local public-route authorization failure %s', async status => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response('Private', { status }));
    const convert = vi.fn();
    expect(await createCardImageService({ fetch, convert, localSource: true })(filename)).toEqual({ status: 503 });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(convert).not.toHaveBeenCalled();
  });
  it('retains original-photo fallback on the same local public route and does not cache missing files', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response('', { status: 404 }))
      .mockResolvedValueOnce(image(new Uint8Array([1])));
    expect((await createCardImageService({ fetch, localSource: true, convert: async () => Buffer.from('ok') })(filename)).status).toBe(200);
    expect(fetch.mock.calls.map(call => call[0])).toEqual([
      'http://host.docker.internal/uploads/thumbs/'+filename,
      'http://host.docker.internal/uploads/'+filename,
    ]);
    const missing = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => new Response('', { status: 404 }));
    const service = createCardImageService({ fetch: missing, localSource: true });
    expect(await service(filename)).toEqual({ status: 404 });
    expect(await service(filename)).toEqual({ status: 404 });
    expect(missing).toHaveBeenCalledTimes(4);
  });
  it('maps only known agency upload paths and keeps the first preload identical to card URLs', () => {
    for (const prefix of ['', 'https://royalhome.tj', 'https://crm.royalhome.tj']) {
      for (const folder of ['/uploads/', '/uploads/thumbs/']) expect(toCardImageUrl(prefix+folder+filename)).toBe('/media/card-v1/'+filename);
      expect(toCatalogImageUrl(prefix+'/uploads/'+filename)).toBe('/media/card-v2/'+filename);
    }
    for (const source of ['/images/hero.webp', '/uploads/legacy-cover.webp', 'https://foreign.test/uploads/'+filename, '/uploads/'+filename+'?resize=10']) {
      expect(toCardImageUrl(source)).toBe(toThumbUrl(source));
      expect(toCatalogImageUrl(source)).toBe(toThumbUrl(source));
    }
  });
  it('rejects arbitrary sources and traversal before any fetch', async () => {
    const fetch = vi.fn(); const service = createCardImageService({ fetch });
    for (const name of ['../'+filename, 'https://localhost/'+filename, '/etc/passwd', filename+'?url=x', filename+'/other', 'a.webp']) {
      expect(await service(name)).toEqual({ status: 404 });
    }
    expect(fetch).not.toHaveBeenCalled();
  });
  it('returns real 640px WebP without cropping or enlarging small originals', async () => {
    for (const [width,height] of [[800,1067],[80,120]]) {
      const source = await sharp({ create: { width,height,channels:3,background:'#1a4d3a' } }).webp().toBuffer();
      const fetch = vi.fn(async (_input: string | URL | Request) => image(new Uint8Array(source)));
      const result = await createCardImageService({ fetch })(filename);
      expect(result.status).toBe(200);
      if (result.status !== 200) throw Error('Image conversion failed');
      const metadata = await sharp(result.bytes).metadata();
      expect(metadata.format).toBe('webp');
      expect(metadata.width).toBe(Math.min(640,width));
      expect(Math.abs(metadata.height!/metadata.width!-height/width)).toBeLessThan(0.01);
      expect(fetch.mock.calls[0][0]).toBe('https://royalhome.tj/uploads/thumbs/'+filename);
    }
  });
  it('matches the catalogue centre crop without enlarging small photos and keeps legacy output separate', async () => {
    for (const [width, height] of [[800, 1067], [80, 120]]) {
      const source = await sharp({ create: { width, height, channels: 3, background: '#1a4d3a' } }).webp().toBuffer();
      const fetch = vi.fn(async () => image(new Uint8Array(source)));
      const service = createCardImageService({ fetch });
      const crop = await service(filename, 'catalog');
      const full = await service(filename);
      if (crop.status !== 200 || full.status !== 200) throw Error('Image conversion failed');
      const cropped = await sharp(crop.bytes).metadata();
      const legacy = await sharp(full.bytes).metadata();
      expect([cropped.width, cropped.height]).toEqual(width === 800 ? [640, 400] : [80, 120]);
      if (width === 800) {
        expect(legacy.height).toBeGreaterThan(cropped.height!);
        expect(full.etag).not.toBe(crop.etag);
      }
      expect(await service(filename, 'catalog')).toBe(crop);
      expect(fetch).toHaveBeenCalledTimes(2);
    }
  });
  it('coalesces concurrent requests, reuses the cache and does not cache failures', async () => {
    let release!:()=>void;
    const gate = new Promise<void>(resolve=>{release=resolve;});
    const fetch = vi.fn(async()=>{await gate;return image(new Uint8Array([1,2,3]));});
    const convert=vi.fn(async()=>Buffer.from('converted'));
    const service=createCardImageService({fetch,convert});
    const requests=[service(filename),service(filename),service(filename)];
    release();
    const results=await Promise.all(requests);
    expect(results.every(row=>row.status===200)).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1); expect(convert).toHaveBeenCalledTimes(1);
    expect(await service(filename)).toBe(results[0]); expect(fetch).toHaveBeenCalledTimes(1);
    const retryFetch=vi.fn().mockResolvedValueOnce(new Response('',{status:503})).mockResolvedValueOnce(image(new Uint8Array([1])));
    const retry=createCardImageService({fetch:retryFetch,convert});
    expect(await retry(filename)).toEqual({status:503});
    expect((await retry(filename)).status).toBe(200); expect(retryFetch).toHaveBeenCalledTimes(2);
  });
  it('falls back to the same fixed-origin original when a legacy thumbnail is absent', async () => {
    const fetch=vi.fn().mockResolvedValueOnce(new Response('',{status:404})).mockResolvedValueOnce(image(new Uint8Array([1])));
    const result=await createCardImageService({fetch,convert:async()=>Buffer.from('converted')})(filename);
    expect(result.status).toBe(200);
    expect(fetch.mock.calls.map(call=>call[0])).toEqual(['https://royalhome.tj/uploads/thumbs/'+filename,'https://royalhome.tj/uploads/'+filename]);
    expect(fetch.mock.calls[0][1].redirect).toBe('error');
  });
  it('bounds input before conversion and rejects non-images', async () => {
    const convert=vi.fn(async()=>Buffer.from('converted'));
    for (const response of [new Response('too large',{headers:{'Content-Type':'image/webp','Content-Length':String(9*1024*1024)}}),new Response('<html>error</html>',{headers:{'Content-Type':'text/html'}})]) {
      expect(await createCardImageService({fetch:vi.fn(async()=>response),convert})(filename)).toEqual({status:503});
    }
    const stream=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(5*1024*1024));controller.enqueue(new Uint8Array(4*1024*1024));controller.close();}});
    expect(await createCardImageService({fetch:vi.fn(async()=>new Response(stream,{headers:{'Content-Type':'image/webp'}})),convert})(filename)).toEqual({status:503});
    expect(convert).not.toHaveBeenCalled();
  });
  it('evicts cached bytes and caps distinct concurrent conversions', async () => {
    const fetch=vi.fn(async()=>image(new Uint8Array([1])));
    const service=createCardImageService({fetch,convert:async()=>Buffer.alloc(700),cacheBytes:1024});
    await service(filename);await service(second);await service(filename);
    expect(fetch).toHaveBeenCalledTimes(3);
    let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
    const limited=createCardImageService({fetch:vi.fn(async()=>{await gate;return image(new Uint8Array([1]));}),convert:async()=>Buffer.from('ok')});
    const active=Array.from({length:8},(_,i)=>limited(`00000000-0000-0000-0000-${String(i).padStart(12,'0')}.webp`));
    expect(await limited(filename)).toEqual({status:503});
    expect(await limited(filename, 'catalog')).toEqual({status:503});
    release();await Promise.all(active);
    expect((await limited(filename)).status).toBe(200);
  });
  it('serves immutable successful variants, conditional GET and HEAD while keeping errors uncached', async () => {
    const service=vi.fn(async(name:string)=>name===filename?{status:200 as const,bytes:Buffer.from('webp'),etag:'"variant"'}:{status:404 as const});
    const app=createCardImagesApp(service);
    const response=await app.request('/'+filename);
    expect(response.status).toBe(200);expect(response.headers.get('Content-Type')).toBe('image/webp');
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=2592000, immutable');
    expect(await response.text()).toBe('webp');
    const unchanged=await app.request('/'+filename,{headers:{'If-None-Match':'W/"variant"'}});
    expect(unchanged.status).toBe(304);expect(await unchanged.text()).toBe('');
    expect(await (await app.request('/'+filename,{method:'HEAD'})).text()).toBe('');
    const missing=await app.request('/missing.webp');
    expect(missing.status).toBe(404);expect(missing.headers.get('Cache-Control')).toBe('no-store');
    const catalogue = createCardImagesApp(service, 'catalog');
    expect((await catalogue.request('/'+filename)).status).toBe(200);
    expect(service).toHaveBeenLastCalledWith(filename, 'catalog');
  });
});
