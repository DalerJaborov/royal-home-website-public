import { districtCopy } from './district-copy';
import type { DistrictPage } from './district-catalog';
import { localizedPath, type PublicLocale } from './public-i18n';
export function districtCollectionJsonLd(district: DistrictPage, locale: PublicLocale, rows: readonly { id: number }[]) {
  return {
    '@context': 'https://schema.org', '@type': 'CollectionPage', inLanguage: locale,
    name: districtCopy(district, locale).heading, url: `https://royalhome.tj${localizedPath(`/kvartiry/${district.slug}`, locale)}`,
    mainEntity: { '@type': 'ItemList', numberOfItems: rows.length, itemListElement: rows.map((row, index) => ({ '@type': 'ListItem', position: index + 1, url: `https://royalhome.tj${localizedPath(`/listing/${row.id}`, locale)}` })) },
  };
}
