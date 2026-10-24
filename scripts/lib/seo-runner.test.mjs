import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

for (const mode of ['reset-once', 'missing', 'missing-hreflang']) test(`full runner preserves evidence: ${mode}`, async () => {
  let assetRequests = 0;
  const server = createServer((request, response) => {
    const path = new URL(request.url, 'http://fixture').pathname;
    if (path === '/sitemap.xml') { response.end('<urlset><url><loc>https://royalhome.tj/listing/901</loc></url></urlset>'); return; }
    if (path === '/assets/fixture.js') {
      assetRequests++;
      if (mode === 'reset-once' && assetRequests === 1) { request.socket.destroy(); return; }
      response.writeHead(mode === 'missing' ? 404 : 200, { 'content-type': 'text/javascript' }); response.end(''); return;
    }
    const missing = path.includes('2147483647') || path.includes('no-such-service');
    const noindex = missing || path === '/favorites' || request.url.includes('rooms=');
    response.writeHead(missing ? 404 : 200, { 'content-type': 'text/html' });
    response.end(`<html lang="ru"><head><title>Fixture</title><meta name="description" content="Public fixture" />
      <meta name="robots" content="${noindex ? 'noindex' : 'index'},follow" />
      <link rel="canonical" href="https://royalhome.tj/listing/901" />
      ${mode === 'missing-hreflang' ? '' : '<link rel="alternate" hreflang="ru" href="https://royalhome.tj/listing/901" /><link rel="alternate" hreflang="x-default" href="https://royalhome.tj/listing/901" />'}
      <script type="application/ld+json">{"@type":"WebPage"}</script>
      <script src="/assets/fixture.js"></script></head><body><main><h1>Public fixture</h1></main></body></html>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const directory = mkdtempSync(join(tmpdir(), 'royalhome-seo-probes-'));
  const reportPath = join(directory, 'report.json');
  try {
    const child = spawn(process.execPath, [fileURLToPath(new URL('../check-public-seo.mjs', import.meta.url))], {
      env: { ...process.env, SEO_CHECK_ORIGIN: `http://127.0.0.1:${server.address().port}`, SEO_CHECK_REPORT: reportPath }, stdio: 'ignore',
    });
    const exit = await new Promise((resolve, reject) => { child.on('close', resolve); child.on('error', reject); });
    const report = JSON.parse(readFileSync(reportPath, 'utf8'));
    assert.equal(report.total, 1);
    if (mode === 'reset-once') {
      assert.equal(exit, 0); assert.equal(assetRequests, 2);
      assert.equal(report.issues.length, 0); assert.equal(report.recoveries.length, 1);
      assert.ok(report.recoveries[0].cause); assert.equal(report.recoveries[0].recoveredStatus, 200);
    } else {
      assert.equal(exit, 1); assert.equal(assetRequests, 1);
      assert.ok(report.issues.some(issue => mode === 'missing' ? issue.status === 404 : issue.error.includes('hreflang')));
    }
  } finally {
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    unlinkSync(reportPath); rmdirSync(directory);
  }
});

test('a blocked sitemap fails honestly and still saves actionable evidence', async () => {
  const server = createServer((_request, response) => {
    response.writeHead(403, { 'content-type': 'text/html', 'cf-mitigated': 'challenge' });
    response.end('<html>Challenge</html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const directory = mkdtempSync(join(tmpdir(), 'royalhome-seo-test-'));
  const reportPath = join(directory, 'report.json');
  try {
    const child = spawn(process.execPath, [fileURLToPath(new URL('../check-public-seo.mjs', import.meta.url))], {
      env: { ...process.env, SEO_CHECK_ORIGIN: `http://127.0.0.1:${server.address().port}`, SEO_CHECK_REPORT: reportPath },
      stdio: 'ignore',
    });
    const exit = await new Promise((resolve, reject) => { child.on('close', resolve); child.on('error', reject); });
    assert.equal(exit, 1);
    const report = JSON.parse(readFileSync(reportPath, 'utf8'));
    assert.equal(report.total, 0);
    assert.deepEqual(report.issues, [{ path: '/sitemap.xml', error: 'Sitemap HTTP_403', contentType: 'text/html', cfMitigated: 'challenge' }]);
  } finally {
    await new Promise(resolve => server.close(resolve));
    unlinkSync(reportPath); rmdirSync(directory);
  }
});
