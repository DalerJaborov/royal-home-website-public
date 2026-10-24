/** Collect across the whole document: organization and page JSON-LD are separate scripts. */
export function structuredDataFacts(schemas, now = Date.now()) {
  const videos = [];
  const errors = [];
  function visit(value) {
    if (!value || typeof value !== 'object') return;
    if ([value['@type']].flat().includes('VideoObject')) videos.push(value);
    for (const [key, item] of Object.entries(value)) {
      if (['datePublished', 'dateModified', 'uploadDate'].includes(key) &&
        (typeof item !== 'string' || !Number.isFinite(Date.parse(item)) || Date.parse(item) > now + 60_000)) errors.push('invalid/future structured date');
      if (item && typeof item === 'object') visit(item);
    }
  }
  for (const schema of schemas) visit(schema);
  for (const video of videos) {
    const thumb = [video.thumbnailUrl].flat()[0];
    if (!video.name || !/^https:\/\//.test(thumb || '') ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(video.uploadDate || '') ||
      !/^https:\/\//.test(video.contentUrl || '')) errors.push('invalid VideoObject');
  }
  return { videos, errors: [...new Set(errors)] };
}
