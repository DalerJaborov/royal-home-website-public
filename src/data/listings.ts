const DISTRICT_COORDS: Record<string, [number, number]> = {
  'Сино': [38.5901, 68.7757],
  'Шохмансур': [38.5765, 68.7648],
  'И. Сомони': [38.5677, 68.8046],
  'Фирдавси': [38.5498, 68.7864],
};
const CITY_CENTER: [number, number] = [38.5598, 68.7870];

// Prefers the listing's real geocoded coordinates (from the CRM — see
// db/schema.ts `lat`/`lng`) when both are present and finite. Falls back to
// the approximate per-district coordinates + small deterministic per-listing
// offset (so pins spread across streets instead of stacking on one point)
// for listings the geocoder hasn't resolved yet.
export function getListingCoords(listing: Listing): [number, number] {
  if (Number.isFinite(listing.lat) && Number.isFinite(listing.lng)) {
    return [listing.lat as number, listing.lng as number];
  }
  const match = listing.location.match(/р-н\s+([^,]+)/);
  const base = (match && DISTRICT_COORDS[match[1].trim()]) || CITY_CENTER;
  const jitterLat = (((listing.id * 37) % 100) - 50) / 100 * 0.006;
  const jitterLng = (((listing.id * 53) % 100) - 50) / 100 * 0.006;
  return [base[0] + jitterLat, base[1] + jitterLng];
}

export interface ListingDetails {
  balcony: string;
  bathroom: string;
  ceilingHeight: string;
  windows: string;
  heating: string;
  elevator: string;
  parking: string;
  security: string;
  yearBuilt: string;
  material: string;
  internet: string;
  furniture: string;
  appliances: string;
}

export interface Listing {
  id: number;
  /** CRM card number — the only listing number shown to visitors. */
  crmShortId?: number;
  title: string;
  titleTj: string;
  location: string;
  price: number;
  rooms: number;
  area: number;
  floor: string;
  totalFloors?: number;
  updatedAt?: string;
  type: 'Новостройки' | 'Вторичка' | '';
  stage: string;
  repair: string;
  images: number;
  photos?: string[];
  urgent: boolean;
  sold?: boolean;
  /** CRM property category; site-native listings are all APARTMENT. */
  category?: 'APARTMENT' | 'HOUSE' | 'COMMERCIAL' | 'LAND';
  date: string;
  seoDesc: string;
  mapAddress?: string;
  /** Real geocoded coordinates from the CRM; absent for listings the free
   * geocoder hasn't resolved — see getListingCoords() for the fallback. */
  lat?: number;
  lng?: number;
  /** Link to an Instagram Reel/post with a video tour of the property. */
  instagramUrl?: string;
  details?: ListingDetails;
  description?: string;
  metaTitle?: string;
  metaDescription?: string;
  h1?: string;
  descriptionTj?: string;
  metaTitleTj?: string;
  metaDescriptionTj?: string;
  h1Tj?: string;
}

const APT_IMAGES = ['/images/apartments/apt1.webp', '/images/apartments/apt2.webp', '/images/apartments/apt3.webp', '/images/hero-bg.webp'];

export function getListingImage(id: number) {
  return APT_IMAGES[id % APT_IMAGES.length];
}

/**
 * Район из строки адреса — ОДИН разбор на весь фронтенд.
 *
 * Адрес приходит в двух форматах, и порядок частей в них разный:
 *   • объект заведён на сайте  — «Душанбе, р-н Сино, ул. Рудаки 10» (город первым);
 *   • объект приехал из CRM    — «Исмоили Сомони, Душанбе» (РАЙОН первым,
 *     см. lib/siteSync.ts в royal-home-crm).
 *
 * Везде, кроме страницы объекта, район брали как `split(',')[1]` — то есть
 * «вторая часть». Для объектов из CRM второй частью идёт город, поэтому у всей
 * растущей части каталога районом показывалось «Душанбе»: значок района терял
 * ровно тот смысл, ради которого его выводят, фильтр районов в админке
 * состоял из одного «Душанбе», а подбор похожих объектов переставал учитывать
 * совпадение района — он сравнивал «Душанбе» с «Душанбе».
 *
 * Берём не позицию, а СМЫСЛ: район — это часть, которая не город и не улица.
 * Находка автопроверки (PR #14).
 */
export function getDistrictName(location: string, fallback = 'Душанбе'): string {
  const parts = location.split(',').map((p) => p.trim());
  const district = parts.find((p) => p && p !== 'Душанбе' && !/^ул\./i.test(p));
  return district ? district.replace(/^р-н\s*/i, '') : fallback;
}

export function pricePerMeter(price: number, area: number) {
  return Math.round(price / area);
}

export function formatPrice(p: number) {
  return p.toLocaleString('ru-RU') + ' с.';
}

function pluralizeRu(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

export function formatRelativeTime(dateStr: string): string {
  const parts = dateStr.split('.');
  if (parts.length !== 3) return dateStr;
  const [day, month, year] = parts.map(Number);
  const date = new Date(year, month - 1, day);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return dateStr;
  if (diffDays === 0) return 'Сегодня';
  if (diffDays === 1) return 'Вчера';
  if (diffDays < 7) return `${diffDays} ${pluralizeRu(diffDays, 'день', 'дня', 'дней')} назад`;
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return `${weeks} ${pluralizeRu(weeks, 'неделю', 'недели', 'недель')} назад`;
  }
  if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    return `${months} ${pluralizeRu(months, 'месяц', 'месяца', 'месяцев')} назад`;
  }
  const years = Math.floor(diffDays / 365);
  return `${years} ${pluralizeRu(years, 'год', 'года', 'лет')} назад`;
}

// Демо-массив LISTINGS, BLOG_POSTS и localStorage-помощники (getStoredListings и
// компания) удалены по решению владельца: каталог давно живёт в БД и приходит через
// API (useListingsData), офлайн-запас — снапшот последнего успешного ответа
// (lib/offlineCatalog.ts). Демо-данные никем не импортировались и могли только
// вводить в заблуждение. Банки-партнёры ещё раньше переехали в CMS.
