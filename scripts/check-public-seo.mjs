// Read-only release gate. No submissions to search engines or form/API writes.
import { writeFileSync } from 'node:fs';
import { structuredDataFacts } from './lib/seo-validation.mjs';
import { createSeoHttp, fetchSeoOrigin } from './lib/seo-http.mjs';
const origin = process.env.SEO_CHECK_ORIGIN || 'https://royalhome.tj';
const canonicalOrigin = 'https://royalhome.tj';
const vantage = origin === canonicalOrigin ? 'public-edge' : 'origin';
const probeHeaders = url => process.env.SEO_CHECK_HOST === 'royalhome.tj' && new URL(url).origin === new URL(origin).origin
  ? { Host: 'royalhome.tj' } : undefined;
const issues = [];
const rows = [];
const startedAt = Date.now();
// A daily job must finish even if every URL is unreachable. Each later probe
// shares this deadline instead of starting another full timeout after it expires.
const auditSignal = AbortSignal.timeout(10 * 60_000);
const http = createSeoHttp({ signal: auditSignal, fetchImpl: process.env.SEO_CHECK_HOST === 'royalhome.tj' ? fetchSeoOrigin : fetch });
const probeFailure = error => error?.probe || { cause: error?.cause?.code || error?.name || 'unknown' };
const progress = phase => console.error(`[seo] ${phase}`);
async function eachProbe(items, probe) {
  const queue = [...items]; let next = 0;
  await Promise.all(Array.from({ length: 3 }, async () => { while (next < queue.length) await probe(queue[next++]); }));
}
async function read(path) {
  const url = new URL(path, origin);
  return http.request(url, { body: true, redirect: 'manual', headers: probeHeaders(url) });
}
function unavailableSitemap(error, details = {}) {
  const report = { checkedAt: new Date().toISOString(), origin, vantage, total: 0, issues: [{ path: '/sitemap.xml', error, ...details }], rows: [] };
  if (process.env.SEO_CHECK_REPORT) writeFileSync(process.env.SEO_CHECK_REPORT, JSON.stringify(report, null, 2));
  console.error(JSON.stringify(report, null, 2));
  throw Error(error);
}
let sitemap;
try { sitemap = await read('/sitemap.xml'); }
catch (error) { unavailableSitemap('Sitemap fetch failed', probeFailure(error)); }
if (sitemap.status !== 200) unavailableSitemap(`Sitemap HTTP_${sitemap.status}`, { contentType: sitemap.contentType, cfMitigated: sitemap.cfMitigated });
const urls = [...sitemap.html.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1].replaceAll('&amp;', '&'));
if (!urls.length || new Set(urls).size !== urls.length) unavailableSitemap('Empty or duplicate sitemap');
// Страницы, которым карта сайта обещает ролик (video:video): на них обязан быть VideoObject.
const videoUrls = new Set([...sitemap.html.matchAll(/<url>([\s\S]*?)<\/url>/g)]
  .filter(m => m[1].includes('<video:video>')).map(m => /<loc>(.*?)<\/loc>/.exec(m[1])?.[1]?.replaceAll('&amp;', '&')));
let cursor = 0;
progress(`Pages: ${urls.length}`);
async function worker() {
  while (cursor < urls.length) {
    const url = urls[cursor++];
    const parsed = new URL(url);
    if (parsed.origin !== canonicalOrigin || /\/(admin|api|favorites)(\/|$)/.test(parsed.pathname) || parsed.search) { issues.push({ url, error: 'private/noncanonical sitemap URL' }); continue; }
    try {
      const { status, html, redirected, ttfbMs, robotsHeader } = await read(parsed.pathname);
      const attr = (tag, key) => tag?.match(new RegExp(`\\b${key}="([^"]*)"`, 'i'))?.[1];
      const links = [...html.matchAll(/<link\b[^>]*>/gi)].map(m => m[0]);
      const metas = [...html.matchAll(/<meta\b[^>]*>/gi)].map(m => m[0]);
      const lang = parsed.pathname.startsWith('/tg/') || parsed.pathname === '/tg' ? 'tg' : parsed.pathname.startsWith('/en/') || parsed.pathname === '/en' ? 'en' : 'ru';
      const row = { url, status, ttfbMs, htmlBytes: Buffer.byteLength(html), lang: html.match(/<html\b[^>]*lang="([^"]+)"/i)?.[1],
        title: html.match(/<title>([\s\S]*?)<\/title>/i)?.[1],
        description: attr(metas.find(t => attr(t, 'name') === 'description'), 'content'),
        canonical: attr(links.find(t => attr(t, 'rel') === 'canonical'), 'href'),
        alternates: Object.fromEntries(links.filter(t => attr(t, 'hreflang')).map(t => [attr(t, 'hreflang'), attr(t, 'href')])) };
      const fail = error => issues.push({ url, error });
      if (row.alternates[lang] !== url) fail('missing/incorrect self-referencing hreflang');
      if (!row.alternates.ru || row.alternates['x-default'] !== row.alternates.ru) fail('missing/incorrect x-default hreflang');
      if (status !== 200) fail(`HTTP_${status}`);
      if (redirected) fail('sitemap URL redirects');
      if (row.lang !== lang || !row.title || !row.description || row.canonical?.replace(/\/$/, '') !== url.replace(/\/$/, '')) fail('language/metadata/canonical');
      if ([...html.matchAll(/<h1\b/gi)].length !== 1 || /<div\s+id="root">\s*<\/div>/i.test(html)) fail('missing readable HTML/H1');
      if (/noindex/i.test(attr(metas.find(t => attr(t, 'name') === 'robots'), 'content') || '')) fail('indexability');
      if (/noindex|none/i.test(robotsHeader)) fail('HTTP indexability');
      const blocks = [...html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
      if (!blocks.length) fail('missing JSON-LD');
      const schemas = [];
      for (const block of blocks) {
        try {
          schemas.push(JSON.parse(block[1]));
        } catch { fail('invalid JSON-LD'); }
      }
      const { videos, errors } = structuredDataFacts(schemas);
      errors.forEach(fail);
      if (videoUrls.has(url) && !videos.length) fail('sitemap promises video, JSON-LD has no VideoObject');
      row.videoSources = videos.map(video => video.contentUrl).filter(Boolean);
      row.videoThumbnails = videos.flatMap(video => [video.thumbnailUrl].flat()).filter(Boolean);
      if (/\/video$/.test(parsed.pathname) && videoUrls.has(url) && !/<video\b[^>]*\bcontrols\b/i.test(html)) fail('watch page has no visible native player');
      const assets = [...html.matchAll(/<(?:script|link|img)\b[^>]*(?:src|href)="(\/(?:assets|fonts|images)\/[^"<>]+)"[^>]*>/gi)].map(m => m[1]);
      row.assets = assets; rows.push(row);
    } catch (error) { issues.push({ url, error: 'fetch_failed', ...probeFailure(error) }); }
    if (cursor % 100 === 0) progress(`Pages requested: ${cursor}/${urls.length}`);
  }
}
await Promise.all([worker(), worker(), worker()]);
const byUrl = new Map(rows.map(row => [row.url.replace(/\/$/, ''), row]));
for (const row of rows) for (const code of Object.keys(row.alternates).filter(code => code !== 'x-default')) {
  const sibling = byUrl.get(row.alternates[code]?.replace(/\/$/, ''));
  if (!sibling || sibling.alternates[row.lang]?.replace(/\/$/, '') !== row.url.replace(/\/$/, '')) issues.push({ url: row.url, error: 'nonreciprocal hreflang ' + code });
}
// HEAD only: do not download 40+ MB videos during a daily health check.
const media = new Map();
for (const row of rows) {
  for (const url of row.videoSources ?? []) media.set(url, 'video');
  for (const url of row.videoThumbnails ?? []) media.set(url, 'image');
}
progress(`Video sources and posters: ${media.size}`);
await eachProbe(media, async ([url, kind]) => {
  try {
    const target = new URL(url);
    if (target.protocol !== 'https:' || !['royalhome.tj', 'crm.royalhome.tj'].includes(target.hostname)) { issues.push({ url, error: 'untrusted video asset' }); return; }
    const mediaUrl = target.origin === canonicalOrigin ? new URL(target.pathname + target.search, origin) : target;
    const response = await http.request(mediaUrl, { method: 'HEAD', redirect: 'manual', headers: probeHeaders(mediaUrl) });
    if (response.status !== 200 || !response.contentType.startsWith(kind + '/')) issues.push({ url, error: 'unavailable/wrong-type video asset', status: response.status, contentType: response.contentType, cfMitigated: response.cfMitigated });
    if (/noindex|none/i.test(response.robotsHeader)) issues.push({ url, error: 'video asset blocks indexing' });
  } catch (error) { issues.push({ url, error: 'video asset fetch failed', ...probeFailure(error) }); }
});
for (const key of ['title', 'description']) {
  const seen = new Set(); for (const row of rows) { if (seen.has(row[key])) issues.push({ url: row.url, error: 'duplicate ' + key }); seen.add(row[key]); }
}
const assets = new Set(rows.flatMap(row => row.assets));
progress(`Public assets: ${assets.size}`);
await eachProbe(assets, async asset => {
  try { const url = new URL(asset, origin); const r = await http.request(url, { method: 'HEAD', redirect: 'manual', headers: probeHeaders(url) }); if (r.status !== 200 || /text\/html/.test(r.contentType)) issues.push({ asset, error: 'missing/wrong-type resource', status: r.status, contentType: r.contentType, cfMitigated: r.cfMitigated }); }
  catch (error) { issues.push({ asset, error: 'resource fetch failed', ...probeFailure(error) }); }
});
progress('Negative/indexability probes');
for (const [path, status, noindex] of [['/listing/2147483647', 404, true], ['/listing/2147483647/video', 404, true], ['/services/no-such-service', 404, true], ['/favorites', 200, true], ['/listings?rooms=2', 200, true], ['/listings?utm_source=seo-check', 200, false]]) {
  try {
    const r = await read(path); const robots = r.html.match(/<meta\b[^>]*name="robots"[^>]*content="([^"]+)"/i)?.[1] || '';
    if (r.status !== status || /noindex/i.test(robots) !== noindex) issues.push({ path, error: 'negative/parameter indexability probe' });
  } catch (error) { issues.push({ path, error: 'negative probe fetch failed', ...probeFailure(error) }); }
}
const report = { checkedAt: new Date().toISOString(), origin, vantage, total: urls.length, durationMs: Date.now() - startedAt,
  recoveries: http.recoveries, issues, rows };
if (process.env.SEO_CHECK_REPORT) writeFileSync(process.env.SEO_CHECK_REPORT, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ checkedAt: report.checkedAt, origin, vantage, total: urls.length, durationMs: report.durationMs, recoveries: report.recoveries, issues }, null, 2));
if (issues.length) process.exitCode = 1;
