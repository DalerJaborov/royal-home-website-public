/**
 * CRM property photos are uploaded twice — full size (1920px, quality 82) at
 * /uploads/{id}.webp and a generated thumbnail alongside it at
 * /uploads/thumbs/{id}.webp (see D:\CRM\apps\api\src\routes\properties.ts).
 * Thumbnail dimensions vary by upload generation (current live cover: 800px).
 * Legacy image helpers and editorial thumbnails use this mapping. Property
 * cards now use toCardImageUrl from the same contract for bounded 640px site
 * variants. This maps a photo URL to its
 * thumb when one exists, and passes anything else (static /images/... assets)
 * through unchanged.
 */
export { toThumbUrl } from '@contracts/image-urls';
