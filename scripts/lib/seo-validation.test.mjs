import { test } from 'node:test';
import assert from 'node:assert/strict';
import { structuredDataFacts } from './seo-validation.mjs';
const video = { '@type': 'VideoObject', name: 'Tour', thumbnailUrl: ['https://royalhome.tj/cover.webp'], uploadDate: '2026-10-01T12:00:00+05:00', contentUrl: 'https://royalhome.tj/media/listing-video/1.mp4' };
test('separate organization script does not create false missing-video findings', () => {
  const result = structuredDataFacts([{ '@graph': [{ '@type': 'Organization' }] }, { '@type': 'RealEstateListing', video }]);
  assert.equal(result.videos.length, 1);
  assert.deepEqual(result.errors, []);
});
test('recognizes root VideoObject and WebPage.mainEntity, once each', () => {
  assert.equal(structuredDataFacts([video]).videos.length, 1);
  assert.equal(structuredDataFacts([{ '@type': 'WebPage', mainEntity: video }]).videos.length, 1);
});
test('catches invalid and future upload dates and incomplete video data', () => {
  assert.ok(structuredDataFacts([{ ...video, uploadDate: '2036-01-01T12:00:00Z' }]).errors.includes('invalid/future structured date'));
  assert.ok(structuredDataFacts([{ ...video, thumbnailUrl: [] }]).errors.includes('invalid VideoObject'));
  assert.equal(structuredDataFacts([{ '@type': 'WebPage' }]).videos.length, 0);
});
