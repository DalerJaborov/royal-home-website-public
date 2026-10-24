import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
