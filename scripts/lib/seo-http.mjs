// Read-only probes retry a transport failure once. HTTP failures (including
// Cloudflare challenges) are returned immediately and never hidden by retries.
export function createSeoHttp({ signal, fetchImpl = fetch, timeoutMs = 25_000 }) {
  const recoveries = [];
  const failureDetails = error => ({ cause: error?.cause?.code || error?.code || error?.name || 'unknown' });
  async function request(url, { method = 'GET', redirect = 'follow', body = false } = {}) {
    if (!['GET', 'HEAD'].includes(method)) throw new Error('SEO probes are read-only');
    let previous;
    const started = Date.now();
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        signal.throwIfAborted();
        const response = await fetchImpl(url, { method, redirect, signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) });
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
