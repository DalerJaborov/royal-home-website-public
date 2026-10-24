import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lighthouseIssues } from './seo-lighthouse.mjs';
const url = 'https://royalhome.tj/';
const valid = { finalDisplayedUrl: url, categories: { performance: { score: 0.66 }, seo: { score: 1 }, accessibility: { score: 1 } }, audits: { 'http-status-code': { score: 1 } } };
test('valid scores are reported without pretending a lab performance threshold proves real-user speed', () => {
  assert.deepEqual(lighthouseIssues(valid, url), []);
});
test('empty traces, redirects and HTTP failures cannot pass the scheduled check', () => {
  const broken = { ...valid, runtimeError: { code: 'NO_NAVSTART' }, finalDisplayedUrl: 'https://example.test/login',
    categories: { ...valid.categories, performance: { score: null } }, audits: {} };
  assert.equal(lighthouseIssues(broken, url).length, 4);
});
test('SEO and substantial accessibility regressions fail while retaining reports', () => {
  const broken = { ...valid, categories: { ...valid.categories, seo: { score: 0.9 }, accessibility: { score: 0.5 } } };
  assert.equal(lighthouseIssues(broken, url).length, 2);
});
