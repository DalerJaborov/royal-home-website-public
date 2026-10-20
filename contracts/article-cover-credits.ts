const ARTICLE_COVER_CREDITS = [
  { articleId: 15, coverUrl: '/uploads/13bb2875-bfea-4812-8ecc-48f7eb50679a.webp', listingId: 100 },
  { articleId: 14, coverUrl: '/uploads/6ed4daf1-e810-434c-bb5e-151e2fb070b4.webp', listingId: 98 },
] as const;

/** Attribution applies only while this exact reviewed image is the cover. */
export function articleCoverCredit(articleId: number, coverUrl: string | null | undefined) {
  return ARTICLE_COVER_CREDITS.find(item => item.articleId === articleId && item.coverUrl === coverUrl);
}
