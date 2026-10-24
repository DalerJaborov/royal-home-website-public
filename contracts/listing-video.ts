import { englishPropertyMeta } from './english-catalog';
import { tajikPropertyTitle, type TajikProperty } from './tajik-catalog';
import { listingSeoTitle } from './listing-seo-title';
import { localizedPath, type PublicLocale } from './public-i18n';

export const VIDEO_COPY = {
  ru: { label: 'Видеообзор', back: 'Фото, цена и описание объекта', catalog: 'Каталог', sold: 'Объект продан. Это архивный видеообзор.', missing: 'Видео недоступно', loading: 'Загружаем видео…' },
  tg: { label: 'Шарҳи видеоӣ', back: 'Аксҳо, нарх ва маълумоти объект', catalog: 'Феҳрист', sold: 'Объект фурӯхта шуд. Ин шарҳи видеоии бойгонӣ аст.', missing: 'Видео дастрас нест', loading: 'Видео бор шуда истодааст…' },
  en: { label: 'Video tour', back: 'Property photos, price and details', catalog: 'Catalog', sold: 'This property is sold. This is an archived video tour.', missing: 'Video unavailable', loading: 'Loading video…' },
} as const;

export function listingVideoContentUrl(id: number): string {
  return `https://royalhome.tj/media/listing-video/${id}.mp4`;
}

/** Only existing public facts. The language describes the page, not a dubbed soundtrack. */
export function listingVideoMeta(row: TajikProperty & { title: string; h1?: string | null; crmShortId?: number | null }, locale: PublicLocale) {
  const copy = VIDEO_COPY[locale];
  const property = locale === 'en' ? englishPropertyMeta(row).heading
    : locale === 'tg' ? tajikPropertyTitle(row) : row.h1?.trim() || row.title;
  const name = listingSeoTitle(`${copy.label}: ${property}`, row.crmShortId);
  const heading = row.crmShortId ? listingSeoTitle(copy.label, row.crmShortId) : `${copy.label}: ${property}`;
  const price = String(row.price).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
  const description = `${name}. ${locale === 'en' ? `Price: ${price} TJS` : locale === 'tg' ? `Нарх: ${price} сомонӣ` : `Цена: ${price} сомони`}. ${row.sold ? copy.sold : copy.back}.`;
  const path = localizedPath(`/listing/${row.id}/video`, locale);
  return { heading, name, property, title: `${name} | ROYAL HOME`, description, path, url: `https://royalhome.tj${path}` };
}
