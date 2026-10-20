/** Match the generated CRM thumbnail used by catalog cards, leaving other assets intact. */
export function toThumbUrl(url: string): string {
  const match = /^(.*)\/uploads\/(?!thumbs\/)([^/]+)$/.exec(url);
  return match ? `${match[1]}/uploads/thumbs/${match[2]}` : url;
}

export const CARD_IMAGE_FILENAME = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.webp$/i;
/** Bounded site variants for known public CRM photos. Other images keep their existing path. */
export function toCardImageUrl(url: string): string {
  const match = /^(?:https?:\/\/(?:royalhome\.tj|crm\.royalhome\.tj))?\/uploads\/(?:thumbs\/)?([^/?#]+)$/i.exec(url);
  return match && CARD_IMAGE_FILENAME.test(match[1]) ? `/media/card-v1/${match[1]}` : toThumbUrl(url);
}

/** The catalogue already displays this centre crop with CSS object-fit: cover. */
export function toCatalogImageUrl(url: string): string {
  return toCardImageUrl(url).replace(/^\/media\/card-v1\//, '/media/card-v2/');
}
