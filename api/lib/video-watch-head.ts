import type { PublicLocale } from '@contracts/public-i18n';
import { localizedPath, publishedAlternates } from '@contracts/public-i18n';
import { listingVideoContentUrl, listingVideoMeta, VIDEO_COPY } from '@contracts/listing-video';
import { listingJsonLd } from '@contracts/listing-jsonld';
import { projectPublicListing } from '@contracts/public-listing';
import { findListingById } from '../queries/listings';
import { completedLocalePages } from './public-translations';
import type { Head } from './prerenderSeo';

const ORIGIN = 'https://royalhome.tj';
const esc = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export async function videoWatchHead(id: number, locale: PublicLocale): Promise<Head | null> {
  const source = await findListingById(id);
  if (!source || source.published === false || !source.videoUrl || !source.imageUrls?.[0]) return null;
  const row = projectPublicListing(source);
  const meta = listingVideoMeta(row, locale);
  const images = row.imageUrls!.map(image => new URL(image, ORIGIN).href);
  const contentUrl = listingVideoContentUrl(id);
  const listingSchema = listingJsonLd({ ...row, title: meta.name, description: meta.description,
    images, url: meta.url, videoUrl: contentUrl, uploadDate: row.createdAt });
  if (!listingSchema.video) return null;
  const copy = VIDEO_COPY[locale];
  const completed = await completedLocalePages();
  const basePath = `/listing/${id}/video`;
  const alternates = publishedAlternates(basePath, completed);
  if (locale !== 'ru' && !alternates.some(alternate => alternate.language === locale)) return null;
  const detail = localizedPath(`/listing/${id}`, locale);
  const catalog = localizedPath('/listings', locale);
  return { ...meta, image: images[0], type: 'website', language: locale, status: 200,
    publicListing: row, alternates,
    // The video is the main entity; its audio is Russian on all language pages.
    jsonLd: { '@context': 'https://schema.org', '@type': 'WebPage', '@id': meta.url,
      url: meta.url, name: meta.title, description: meta.description, inLanguage: locale,
      mainEntity: { ...listingSchema.video, '@id': `${meta.url}#video`, url: meta.url,
        isPartOf: { '@type': 'WebPage', '@id': meta.url },
        about: { '@type': 'RealEstateListing', url: `${ORIGIN}${detail}` } } },
    body: `<main class="mx-auto max-w-3xl px-4 pt-28 pb-24"><nav aria-label="${esc(copy.catalog)}"><a href="${catalog}">${esc(copy.catalog)}</a> · <a href="${detail}">${esc(copy.back)}</a></nav><h1 class="text-2xl font-bold mt-5 mb-2">${esc(meta.heading)}</h1><p class="text-gray-600 mb-5">${esc(meta.property)}</p><video controls playsinline preload="none" poster="${esc(images[0])}" src="${esc(new URL(contentUrl).pathname)}" aria-label="${esc(meta.heading)}" style="display:block;width:100%;max-height:70vh;aspect-ratio:4/3;background:#10231b;border-radius:16px;object-fit:contain"></video>${row.sold ? `<p class="my-4">${esc(copy.sold)}</p>` : ''}<p class="my-4">${esc(meta.description)}</p><a class="inline-block underline my-4" href="${detail}">${esc(copy.back)}</a></main>` };
}
