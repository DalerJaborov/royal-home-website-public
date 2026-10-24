import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSeoHttp } from './seo-http.mjs';

test('recovers one transport failure and retains its evidence', async () => {
  let calls = 0;
  const client = createSeoHttp({ signal: AbortSignal.timeout(1000), fetchImpl: async () => {
    if (++calls === 1) throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } });
    return new Response('readable', { headers: { 'content-type': 'text/html' } });
  } });
  assert.equal((await client.request('https://example.test/', { body: true })).html, 'readable');
  assert.equal(calls, 2);
  assert.deepEqual(client.recoveries, [{ url: 'https://example.test/', method: 'GET', cause: 'ECONNRESET', recoveredStatus: 200 }]);
});

test('persistent failures remain failures with bounded attempts', async () => {
  let calls = 0;
  const client = createSeoHttp({ signal: AbortSignal.timeout(1000), fetchImpl: async () => { calls++; throw Object.assign(new Error('connect'), { code: 'ETIMEDOUT' }); } });
  await assert.rejects(client.request('https://example.test/', { method: 'HEAD' }), e => e.probe.cause === 'ETIMEDOUT' && e.probe.attempts === 2);
  assert.equal(calls, 2);
  assert.deepEqual(client.recoveries, []);
});

test('does not retry challenges or genuine missing resources', async () => {
  for (const status of [403, 404, 503]) {
    let calls = 0;
    const client = createSeoHttp({ signal: AbortSignal.timeout(1000), fetchImpl: async () => { calls++; return new Response('blocked', { status, headers: { 'cf-mitigated': 'challenge' } }); } });
    assert.equal((await client.request('https://example.test/')).status, status);
    assert.equal(calls, 1);
  }
});

test('a shared expired deadline prevents further network calls', async () => {
  const controller = new AbortController(); controller.abort();
  let calls = 0;
  const client = createSeoHttp({ signal: controller.signal, fetchImpl: async () => { calls++; return new Response(); } });
  await assert.rejects(client.request('https://example.test/'));
  assert.equal(calls, 0);
  await assert.rejects(client.request('https://example.test/', { method: 'POST' }), /read-only/);
});
