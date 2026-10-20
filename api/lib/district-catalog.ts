import { districtCopy } from '@contracts/district-copy';
import { districtListings, districtStats, DISTRICT_PAGES, type DistrictPage } from '@contracts/district-catalog';
import type { PublicListing } from '@contracts/public-listing';
import { localizedPath, type PublicLocale } from '@contracts/public-i18n';
import { toCardImageUrl } from '@contracts/image-urls';
import { tajikPropertyTitle } from '@contracts/tajik-catalog';
import { englishPropertyMeta } from '@contracts/english-catalog';
import { listingFactsHtml } from './listing-facts';
import { districtCollectionJsonLd } from '@contracts/district-schema';

const esc = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export function districtNavigationHtml(locale: PublicLocale) {
  return `<nav>${DISTRICT_PAGES.map(d => `<a href="${localizedPath(`/kvartiry/${d.slug}`, locale)}">${esc(districtCopy(d, locale).heading)}</a>`).join(' · ')}</nav>`;
}
export function districtPageData(inventory: readonly PublicListing[], district: DistrictPage, locale: PublicLocale, translate = (text: string) => text) {
  const copy = districtCopy(district, locale), rows = districtListings(inventory, district), stats = districtStats(rows);
  const number = (value: number | null) => value == null ? '—' : value.toLocaleString(locale === 'en' ? 'en-US' : locale === 'tg' ? 'tg-TJ' : 'ru-RU');
  const metrics = [[copy.count, String(stats.count)], [copy.range, `${number(stats.min)}–${number(stats.max)} ${copy.currency}`],
    [copy.median, `${number(stats.median)} ${copy.currency}`], [copy.perMeter, `${number(stats.medianPerMeter)} ${copy.currency}`], [copy.rooms, stats.rooms.join(', ')],
    ...(stats.updatedAt ? [[copy.updated, stats.updatedAt]] : [])];
  const cards = rows.map((row, index) => {
    const name = locale === 'tg' ? tajikPropertyTitle(row) : locale === 'en' ? englishPropertyMeta(row).heading : row.title;
    const image = row.imageUrls?.[0];
    return `<article><a href="${localizedPath(`/listing/${row.id}`, locale)}">${image ? `<img src="${esc(toCardImageUrl(image))}" alt="${esc(name)}" width="640" height="400" loading="${index ? 'lazy' : 'eager'}"${index ? '' : ' fetchpriority="high"'} />` : ''}<h3>${esc(name)}</h3></a><p>${esc(number(row.price))} ${esc(copy.currency)} · ${row.area} ${locale === 'en' ? 'm²' : 'м²'}</p>${listingFactsHtml(row, translate)}</article>`;
  }).join('');
  const body = `<p>${esc(copy.intro)}</p><section><h2>${esc(copy.stats)}</h2>${stats.count ? `<dl>${metrics.map(([label, value]) => `<dt>${esc(label)}</dt><dd>${esc(value)}</dd>`).join('')}</dl>` : ''}<p>${esc(copy.method)}</p></section><section><h2>${esc(copy.listings)}</h2>${cards || `<p>${esc(copy.empty)}</p>`}</section><section><h2>${esc(copy.checklist)}</h2><ol>${copy.steps.map(step => `<li>${esc(step)}</li>`).join('')}</ol></section><p><a href="${localizedPath('/contacts', locale)}">${esc(copy.contacts)}</a> · <a href="${localizedPath('/listings', locale)}">${esc(copy.catalog)}</a></p>`;
  return { copy, rows, stats, body, jsonLd: districtCollectionJsonLd(district, locale, rows) };
}
