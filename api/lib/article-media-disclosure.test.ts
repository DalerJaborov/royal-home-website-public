import { describe, expect, it } from 'vitest';
import { historicalArticleMediaDisclosure, HISTORICAL_ARTICLE_MEDIA } from '@contracts/article-media-disclosure';

describe('reviewed historical image disclosure', () => {
  it('covers only the exact14 reviewed revisions and distinguishes the12 editorial covers from two source-credited photos', () => {
    expect(HISTORICAL_ARTICLE_MEDIA).toHaveLength(14);
    expect(HISTORICAL_ARTICLE_MEDIA.filter(row => row.coverIllustration)).toHaveLength(12);
    for (const row of HISTORICAL_ARTICLE_MEDIA) {
      expect(historicalArticleMediaDisclosure({ id: row.id, coverImageUrl: row.coverUrl, sourceHash: row.sourceHash })).toEqual({ cover: ![14, 15].includes(row.id), body: true });
    }
  });
  it('keeps known cover provenance after a text edit and does not infer body-image provenance', () => {
    const row = HISTORICAL_ARTICLE_MEDIA[0];
    const source = { id: row.id, coverImageUrl: row.coverUrl, sourceHash: row.sourceHash };
    expect(historicalArticleMediaDisclosure({ ...source, id: 999 })).toBeUndefined();
    expect(historicalArticleMediaDisclosure({ ...source, coverImageUrl: '/api/uploads/another.webp' })).toBeUndefined();
    expect(historicalArticleMediaDisclosure({ ...source, sourceHash: undefined })).toEqual({ cover: true, body: false });
    expect(historicalArticleMediaDisclosure({ ...source, sourceHash: 'edited-source' })).toEqual({ cover: true, body: false });
  });
});
