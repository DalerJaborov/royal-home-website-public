import type { PublicLocale } from '@contracts/public-i18n';
import { tajikPropertyTitle, tajikPropertyDescription, tajikDistrict } from '@contracts/tajik-catalog';
import { formatRelativeTime, type Listing } from '@/data/listings';

type Translate = (source: string) => string;
export function listingTitle(listing: Listing, locale: PublicLocale, text: Translate): string {
  if (locale === 'ru') return listing.title;
  if (locale === 'tg') return tajikPropertyTitle(listing);
  const translated = text(listing.title);
  if (translated !== listing.title) return translated;
  const category = listing.category ?? 'APARTMENT';
  const noun = category === 'HOUSE' ? `${listing.rooms}-room house` : category === 'LAND' ? 'Land plot' : category === 'COMMERCIAL' ? 'Commercial property' : `${listing.rooms}-room apartment`;
  return `${noun}, ${listing.area} m² in Dushanbe`;
}

export function listingDescription(listing: Listing, locale: PublicLocale, text: Translate): string {
  const source = listing.description || listing.seoDesc;
  if (locale === 'ru') return source;
  if (locale === 'tg') return tajikPropertyDescription(listing);
  const translated = text(source);
  return translated !== source ? translated : `${listingTitle(listing, locale, text)}. Price: ${listing.price.toLocaleString('en-US')} somoni. ${listing.sold ? 'This property has been sold. See the catalog for current offers.' : 'Contact ROYAL HOME for more information or to arrange a viewing.'}`;
}

export function listingLocation(listing: Listing, locale: PublicLocale, text: Translate): string {
  if (locale === 'ru') return listing.location;
  const translated = text(listing.location);
  if (translated !== listing.location) return translated;
  return locale === 'tg' ? `Душанбе, ${tajikDistrict(listing.location)}` : 'Dushanbe';
}

export function listingDate(value: string, locale: PublicLocale): string {
  if (locale === 'ru') return formatRelativeTime(value);
  const [day, month, year] = value.split('.').map(Number);
  if (!day || !month || !year) return value;
  return new Date(year, month - 1, day).toLocaleDateString(locale === 'tg' ? 'tg-TJ' : 'en-GB');
}
