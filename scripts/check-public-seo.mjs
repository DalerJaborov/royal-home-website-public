// Read-only release gate. No submissions to search engines or form/API writes.
import { writeFileSync } from 'node:fs';
const origin = process.env.SEO_CHECK_ORIGIN || 'https://royalhome.tj';
const canonicalOrigin = 'https://royalhome.tj';
const issues = [];
const rows = [];
async function read(path) {
  const response = await fetch(new URL(path, origin), { signal: AbortSignal.timeout(25_000) });
  return { status: response.status, html: await response.text() };
}
const sitemap = await read('/sitemap.xml');
if (sitemap.status !== 200) throw Error('Sitemap unavailable');
const urls = [...sitemap.html.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1].replaceAll('&amp;', '&'));
if (!urls.length || new Set(urls).size !== urls.length) throw Error('Empty or duplicate sitemap');
let cursor = 0;
async function worker() {
  while (cursor < urls.length) {
    const url = urls[cursor++];
    const parsed = new URL(url);
    if (parsed.origin !== canonicalOrigin || /\/(admin|api|favorites)(\/|$)/.test(parsed.pathname) || parsed.search) { issues.push({ url, error: 'private/noncanonical sitemap URL' }); continue; }
    try {
      const { status, html } = await read(parsed.pathname);
      const attr = (tag, key) => tag?.match(new RegExp(`\\b${key}="([^"]*)"`, 'i'))?.[1];
      const links = [...html.matchAll(/<link\b[^>]*>/gi)].map(m => m[0]);
      const metas = [...html.matchAll(/<meta\b[^>]*>/gi)].map(m => m[0]);
      const lang = parsed.pathname.startsWith('/tg/') || parsed.pathname === '/tg' ? 'tg' : parsed.pathname.startsWith('/en/') || parsed.pathname === '/en' ? 'en' : 'ru';
      const row = { url, status, lang: html.match(/<html\b[^>]*lang="([^"]+)"/i)?.[1],
        title: html.match(/<title>([\s\S]*?)<\/title>/i)?.[1],
        description: attr(metas.find(t => attr(t, 'name') === 'description'), 'content'),
        canonical: attr(links.find(t => attr(t, 'rel') === 'canonical'), 'href'),
        alternates: Object.fromEntries(links.filter(t => attr(t, 'hreflang')).map(t => [attr(t, 'hreflang'), attr(t, 'href')])) };
      const fail = error => issues.push({ url, error });
      if (status !== 200) fail(`HTTP_${status}`);
      if (row.lang !== lang || !row.title || !row.description || row.canonical?.replace(/\/$/, '') !== url.replace(/\/$/, '')) fail('language/metadata/canonical');
      if ([...html.matchAll(/<h1\b/gi)].length !== 1 || /<div\s+id="root">\s*<\/div>/i.test(html)) fail('missing readable HTML/H1');
      if (/noindex/i.test(attr(metas.find(t => attr(t, 'name') === 'robots'), 'content') || '')) fail('indexability');
      const blocks = [...html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
      if (!blocks.length) fail('missing JSON-LD');
      for (const block of blocks) {
        try {
          const schema = JSON.parse(block[1]);
          const visit = value => { if (!value || typeof value !== 'object') return; for (const [key, item] of Object.entries(value)) {
            if (['datePublished', 'dateModified'].includes(key) && (typeof item !== 'string' || !Number.isFinite(Date.parse(item)) || Date.parse(item) > Date.now() + 60_000)) fail('invalid/future structured date');
            if (item && typeof item === 'object') visit(item);
          } }; visit(schema);
        } catch { fail('invalid JSON-LD'); }
      }
      const assets = [...html.matchAll(/<(?:script|link|img)\b[^>]*(?:src|href)="(\/(?:assets|fonts|images)\/[^"<>]+)"[^>]*>/gi)].map(m => m[1]);
      row.assets = assets; rows.push(row);
    } catch { issues.push({ url, error: 'fetch_failed' }); }
  }
}
await Promise.all([worker(), worker(), worker()]);
const byUrl = new Map(rows.map(row => [row.url.replace(/\/$/, ''), row]));
for (const row of rows) for (const code of ['ru', 'tg', 'en']) {
  const sibling = byUrl.get(row.alternates[code]?.replace(/\/$/, ''));
  if (!sibling || sibling.alternates[row.lang]?.replace(/\/$/, '') !== row.url.replace(/\/$/, '')) issues.push({ url: row.url, error: 'nonreciprocal hreflang ' + code });
}
for (const key of ['title', 'description']) {
  const seen = new Set(); for (const row of rows) { if (seen.has(row[key])) issues.push({ url: row.url, error: 'duplicate ' + key }); seen.add(row[key]); }
}
for (const asset of new Set(rows.flatMap(row => row.assets))) {
  try { const r = await fetch(new URL(asset, origin), { method: 'HEAD', signal: AbortSignal.timeout(20_000) }); if (r.status !== 200 || /text\/html/.test(r.headers.get('content-type') || '')) issues.push({ asset, error: 'missing/wrong-type resource' }); }
  catch { issues.push({ asset, error: 'resource fetch failed' }); }
}
for (const [path, status, noindex] of [['/listing/2147483647', 404, true], ['/services/no-such-service', 404, true], ['/favorites', 200, true], ['/listings?rooms=2', 200, true], ['/listings?utm_source=seo-check', 200, false]]) {
  const r = await read(path); const robots = r.html.match(/<meta\b[^>]*name="robots"[^>]*content="([^"]+)"/i)?.[1] || '';
  if (r.status !== status || /noindex/i.test(robots) !== noindex) issues.push({ path, error: 'negative/parameter indexability probe' });
}
const report = { checkedAt: new Date().toISOString(), origin, total: urls.length, issues, rows };
if (process.env.SEO_CHECK_REPORT) writeFileSync(process.env.SEO_CHECK_REPORT, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ checkedAt: report.checkedAt, origin, total: urls.length, issues }, null, 2));
if (issues.length) process.exitCode = 1;
