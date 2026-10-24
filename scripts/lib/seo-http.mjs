/** Explicit local virtual-host probe. Fetch strips Host on some Node versions;
 * native HTTP preserves the public Caddy host without touching DNS/firewall/TLS. */
export async function fetchSeoOrigin(url, options) {
  if (!['GET', 'HEAD'].includes(options.method)) throw Error('SEO probes are read-only');
  if (options.headers?.Host !== 'royalhome.tj') return fetch(url, options);
  const target = new URL(url);
  if (target.protocol !== 'http:' || target.username || target.password || !['host.docker.internal', '127.0.0.1', 'localhost'].includes(target.hostname)) throw Error('Invalid local SEO origin');
  const { request } = await import('node:http');
  const { Readable } = await import('node:stream');
  return new Promise((resolve, reject) => {
    const req = request(target, { method: options.method, headers: options.headers, signal: options.signal }, response => {
      response.on('error', reject);
      const headers = new Headers();
      for (const [key, value] of Object.entries(response.headers)) if (value !== undefined) headers.set(key, [value].flat().join(', '));
      const empty = options.method === 'HEAD' || [204, 205, 304].includes(response.statusCode);
      if (empty) response.resume();
      resolve(new Response(empty ? null : Readable.toWeb(response), { status: response.statusCode, headers }));
    });
    req.on('error', reject); req.end();
  });
}

// Read-only probes retry a transport failure once. HTTP failures (including
// Cloudflare challenges) are returned immediately and never hidden by retries.
export function createSeoHttp({ signal, fetchImpl = fetch, timeoutMs = 25_000 }) {
  const recoveries = [];
  const failureDetails = error => ({ cause: error?.cause?.code || error?.code || error?.name || 'unknown' });
  async function request(url, { method = 'GET', redirect = 'follow', body = false, headers } = {}) {
    if (!['GET', 'HEAD'].includes(method)) throw new Error('SEO probes are read-only');
    let previous;
    const started = Date.now();
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        signal.throwIfAborted();
        const response = await fetchImpl(url, { method, redirect, headers, signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) });
        const result = { status: response.status, redirected: response.redirected, ttfbMs: Date.now() - started,
          robotsHeader: response.headers.get('x-robots-tag') || '', contentType: response.headers.get('content-type') || '',
          cfMitigated: response.headers.get('cf-mitigated') || '', html: body ? await response.text() : '' };
        if (!body) await response.body?.cancel();
        if (previous) recoveries.push({ url: String(url), method, ...previous, recoveredStatus: result.status });
        return result;
      } catch (error) {
        previous = failureDetails(error);
        if (attempt === 2 || signal.aborted) {
          throw Object.assign(new Error('SEO request failed', { cause: error }), { probe: { ...previous, attempts: attempt } });
        }
      }
    }
  }
  return { request, recoveries };
}
