import { describe, expect, it } from 'vitest';
import { versionPublicAssets } from '../../scripts/version-public-assets';

const template = '<link href="/fonts.css" rel="stylesheet"><script src="/telegram-webapp-loader.js"></script><script src="/assets/already-hashed.js"></script>';

describe('public entry asset cache versions', () => {
  it('a previously cached 404 uses a fresh key while hashed build chunks keep their URLs', () => {
    const output = versionPublicAssets(template, (name) => Buffer.from(name));
    expect(output).toMatch(/href="\/fonts\.css\?v=[a-f0-9]{12}"/);
    expect(output).toMatch(/src="\/telegram-webapp-loader\.js\?v=[a-f0-9]{12}"/);
    expect(output).toContain('/assets/already-hashed.js');
    expect(versionPublicAssets(output, (name) => Buffer.from(name))).toBe(output);
  });
  it('only the changed file gets a different version, preserving caches for unchanged content', () => {
    const first = versionPublicAssets(template, (name) => Buffer.from(name));
    const second = versionPublicAssets(template, (name) => Buffer.from(name === 'fonts.css' ? 'updated fonts' : name));
    const getSource = (html: string) => html.match(/src="(\/telegram[^"]+)"/)?.[1];
    expect(getSource(first)).toBe(getSource(second));
    expect(first.match(/href="([^"]+)"/)?.[1]).not.toEqual(second.match(/href="([^"]+)"/)?.[1]);
  });
  it('versions both worker and registration URL when worker policy changes, with one production registration', () => {
    const page = `<html><head>${template}</head><body><div id="root"></div></body></html>`;
    const first = versionPublicAssets(page, name => Buffer.from(name));
    const revised = versionPublicAssets(first, name => Buffer.from(name === 'sw.js' ? 'revised worker policy' : name));
    const registration = (html: string) => html.match(/src="(\/register-sw\.js[^" ]+)"/)?.[1];
    const worker = (html: string) => html.match(/data-worker-version="([a-f0-9]+)"/)?.[1];
    expect(registration(first)).toMatch(/\?v=[a-f0-9]{12}$/);
    expect(registration(revised)).not.toBe(registration(first));
    expect(worker(revised)).not.toBe(worker(first));
    expect(revised.match(/src="\/register-sw\.js/g)).toHaveLength(1);
    expect(versionPublicAssets(first, name => Buffer.from(name))).toBe(first);
  });
});
