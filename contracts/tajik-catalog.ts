export const TAJIK_CATALOG = {
  path: '/tg/khonaho-dushanbe',
  title: 'Хонаҳои фурӯшӣ дар Душанбе | ROYAL HOME',
  description: 'Манзилҳо, хонаҳои алоҳида, қитъаҳои замин ва амволи тиҷоратӣ дар Душанбе. Аксҳо, нарх бо сомонӣ ва масоҳати пешниҳодҳои ROYAL HOME.',
  h1: 'Хонаҳо дар Душанбе',
  intro: 'Манзилҳо, хонаҳои алоҳида, қитъаҳои замин ва амволи тиҷоратиро дар як феҳрист муқоиса кунед. Дар ҳар эълон нарх, масоҳат ва аксҳои мавҷуда нишон дода мешаванд.',
  guidance: 'Барои харидани хона дар Душанбе, аввал буҷет, шумораи ҳуҷраҳо ва ноҳияи муносибро муайян кунед. Барои маълумоти бештар ё ташкили боздид бо ROYAL HOME тамос гиред.',
  districts: 'Пешниҳодҳоро аз ноҳияҳои Сино, Исмоили Сомонӣ, Фирдавсӣ ва Шоҳмансур муқоиса кунед. Ҷойгиршавии ҳар объект дар эълони он нишон дода мешавад.',
} as const;

export const TAJIK_CONTACTS = {
  path: '/tg/tamos', title: 'Тамос бо ROYAL HOME дар Душанбе', h1: 'Бо мо тамос гиред',
  description: 'Тамос бо агентии ROYAL HOME дар Душанбе: телефон барои занг, WhatsApp, суроғаи идора ва дархост барои харидани ё фурӯхтани амвол.',
  intro: 'Барои интихоби амвол, фурӯши хона ё ташкили боздид ба мо занг занед ё дар WhatsApp нависед.',
} as const;

export type PropertyCategory = 'APARTMENT' | 'HOUSE' | 'COMMERCIAL' | 'LAND';
export const TAJIK_CATEGORIES: Record<PropertyCategory, string> = {
  APARTMENT: 'Хона', HOUSE: 'Хонаи алоҳида', COMMERCIAL: 'Амволи тиҷоратӣ', LAND: 'Қитъаи замин',
};

export interface TajikProperty {
  id: number; rooms: number; area: number; price: number; location: string;
  category?: PropertyCategory; sold?: boolean; floor?: string | null;
  h1Tj?: string | null; metaTitleTj?: string | null; metaDescriptionTj?: string | null; descriptionTj?: string | null;
}

export function tajikDistrict(location: string): string {
  if (/Сомон[иӣ]/i.test(location)) return 'Исмоили Сомонӣ';
  if (/Шо[хҳ]?мансур/i.test(location)) return 'Шоҳмансур';
  if (/Фирдавс[иӣ]/i.test(location)) return 'Фирдавсӣ';
  if (/Сино/i.test(location)) return 'Сино';
  return 'Душанбе';
}

/** Existing translation is optional. Plain Russian source text is never presented as translated. */
export function usefulTajikText(value: string | null | undefined): value is string {
  if (!value?.trim() || /комнатн|прода[её]тся|недвижимост|новостройк|евроремонт|этаж|цена:/i.test(value)) return false;
  return /[қҳҷғӯӣ]/i.test(value) || /(?:^|\s)(?:хона|дар|бо|нарх|масоҳат|фурӯш)/i.test(value);
}

function normalizeDistrictSpelling(value: string): string {
  return value.replace(/Исмоили Сомони/g, 'Исмоили Сомонӣ').replace(/И\.\s*Сомони/g, 'Исмоили Сомонӣ')
    .replace(/Фирдавси/g, 'Фирдавсӣ').replace(/Шохмансур/g, 'Шоҳмансур').replace(/биноии/g, 'бинои').replace(/Квартираи/g, 'Хонаи').replace(/квартираи/g, 'хонаи');
}

function appropriateTranslation(value: string | null | undefined, listing: TajikProperty): value is string {
  return usefulTajikText(value) && !((listing.category ?? 'APARTMENT') !== 'APARTMENT' && /квартира/i.test(value));
}

export function tajikPropertyTitle(listing: TajikProperty): string {
  if (appropriateTranslation(listing.h1Tj, listing)) return normalizeDistrictSpelling(listing.h1Tj.trim());
  const category = listing.category ?? 'APARTMENT';
  const noun = category === 'APARTMENT' ? `Хонаи ${listing.rooms}-ҳуҷрагӣ`
    : category === 'HOUSE' ? `Хонаи алоҳидаи ${listing.rooms}-ҳуҷрагӣ` : TAJIK_CATEGORIES[category];
  const district = tajikDistrict(listing.location);
  return `${noun}, ${listing.area} м² ${district === 'Душанбе' ? 'дар Душанбе' : `дар ноҳияи ${district}`}`;
}

export function tajikPropertyDescription(listing: TajikProperty): string {
  // Old deterministic descriptions included unverifiable neighborhood/inspection
  // claims. Facts from the actual row are a safer fallback than inventing detail.
  if (appropriateTranslation(listing.descriptionTj, listing) && !/тафтишшуда|наздик мактабҳо|инфрасохтори тайёр/i.test(listing.descriptionTj)) {
    return normalizeDistrictSpelling(listing.descriptionTj.trim());
  }
  // Stored prices are integer somoni. Keep their grouping identical across
  // server/browser ICU versions so localized card text hydrates unchanged.
  const price = String(listing.price).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
  return `${tajikPropertyTitle(listing)}. Нарх: ${price} сомонӣ.${listing.floor ? ` Ошёна: ${listing.floor}.` : ''} ${listing.sold ? 'Объект фурӯхта шуд. Барои пешниҳодҳои ҷорӣ феҳристро бинед.' : 'Барои маълумоти бештар ва ташкили боздид бо ROYAL HOME тамос гиред.'}`;
}

export function tajikPropertyMeta(listing: TajikProperty) {
  const heading = tajikPropertyTitle(listing);
  const title = listing.sold ? `Фурӯхта шуд: ${heading} | ROYAL HOME`
    : appropriateTranslation(listing.metaTitleTj, listing) ? normalizeDistrictSpelling(listing.metaTitleTj.trim()) : `${heading} | ROYAL HOME`;
  const description = appropriateTranslation(listing.metaDescriptionTj, listing) && !/тафтишшуда/i.test(listing.metaDescriptionTj)
    ? normalizeDistrictSpelling(listing.metaDescriptionTj.trim()) : tajikPropertyDescription(listing);
  return { heading, title, description: description.length > 165 ? `${description.slice(0, 162).trim()}…` : description };
}

export function tajikOfficeAddress(value: string): string {
  return value.replace(/г\.\s*/g, '').replace(/ул\.\s*/g, 'кӯчаи ').replace(/(\d+)\s*этаж/gi, 'ошёнаи $1');
}
