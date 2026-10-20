import { describe, expect, it } from 'vitest';
import { articleCoverCredit } from '@contracts/article-cover-credits';

describe('reviewed article cover attribution', () => {
  it('links the two approved originals to their actual catalog objects', () => {
    expect(articleCoverCredit(15, '/uploads/13bb2875-bfea-4812-8ecc-48f7eb50679a.webp')?.listingId).toBe(100);
    expect(articleCoverCredit(14, '/uploads/6ed4daf1-e810-434c-bb5e-151e2fb070b4.webp')?.listingId).toBe(98);
  });
  it('removes attribution if another article or replacement cover is configured', () => {
    expect(articleCoverCredit(14, '/uploads/13bb2875-bfea-4812-8ecc-48f7eb50679a.webp')).toBeUndefined();
    expect(articleCoverCredit(15, '/api/uploads/new-illustration.webp')).toBeUndefined();
    expect(articleCoverCredit(15, null)).toBeUndefined();
  });
});
