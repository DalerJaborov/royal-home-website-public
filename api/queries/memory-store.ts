// In-memory store for dev mode when database is unavailable
// Loaded from seed data — persists until server restart

import { matchesSearch } from "../lib/searchTokens";

export interface MemoryListing {
  id: number;
  title: string;
  location: string;
  price: number;
  rooms: number;
  area: number;
  floor: string | null;
  totalFloors: number | null;
  type: "Новостройки" | "Вторичка" | null;
  stage: string | null;
  repair: string | null;
  urgent: boolean;
  sold: boolean;
  images: number;
  imageUrls: string[] | null;
  photos?: string[];
  description: string | null;
  seoDesc: string | null;
  details?: Record<string, string> | null;
  mapAddress?: string | null;
  lat?: number | null;
  lng?: number | null;
  instagramUrl?: string | null;
  videoUrl?: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  h1?: string | null;
  descriptionTj?: string | null;
  metaTitleTj?: string | null;
  metaDescriptionTj?: string | null;
  h1Tj?: string | null;
  // Отсутствует в фикстурах (см. заметку ниже) — на APARTMENT-фолбэк в
  // buildListingSeoMeta это не влияет, там undefined трактуется как APARTMENT.
  category?: "APARTMENT" | "HOUSE" | "COMMERCIAL" | "LAND";
  // Memory fixtures are always site-native (see note below) — these default
  // to published/non-CRM-synced when omitted, matching the DB schema shape
  // closely enough for the admin routes that read them (published/externalId
  // checks in listing-router.ts).
  published?: boolean;
  externalId?: string | null;
  crmShortId?: number | null;
  date: string;
  agentId: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MemoryLead {
  id: number;
  name: string | null;
  phone: string;
  message: string | null;
  source: string;
  status: "new" | "contacted" | "closed";
  crmClientId: string | null;
  createdAt: Date;
}

let nextListingId = 17;
let nextLeadId = 1;

export const memoryListings: MemoryListing[] = [
  { id: 1, title: "3-комнатная квартира 115 м² с евроремонтом", location: "Душанбе, р-н Шохмансур, ул. Шохина, 25", price: 1650000, rooms: 3, area: 115, floor: "14/18", totalFloors: 18, type: "Новостройки", stage: "Построен", repair: "Новый ремонт", urgent: true, sold: false, images: 5, imageUrls: null,
    photos: [
      '/images/apartments/apt2_1.jpg',
      '/images/apartments/apt1_1.jpg',
      '/images/apartments/apt3_1.jpg',
      '/images/apartments/apt2_4.jpg',
      '/images/apartments/apt3_5.jpg',
    ], description: "Просторная 3-комнатная квартира", seoDesc: "Продаётся 3-комнатная квартира 115 м²", date: "26.06.2026", agentId: 1, createdAt: new Date(), updatedAt: new Date() },
  { id: 2, title: "2-комнатная квартира 78 м² в новом доме", location: "Душанбе, р-н Сино, ул. Айни, 12", price: 1146000, rooms: 2, area: 78, floor: "13/19", totalFloors: 19, type: "Новостройки", stage: "Построен", repair: "Новый ремонт", urgent: true, sold: false, images: 4, imageUrls: null,
    photos: [
      '/images/apartments/apt3_1.jpg',
      '/images/apartments/apt9_3.jpg',
      '/images/apartments/apt3_4.jpg',
      '/images/apartments/apt4_3.jpg',
      '/images/apartments/apt1_1.jpg',
    ], description: "Современная квартира", seoDesc: "Купить 2-комнатную квартиру 78 м²", date: "03.07.2026", agentId: 2, createdAt: new Date(), updatedAt: new Date() },
  { id: 3, title: "4-комнатные апартаменты 167 м² премиум-класса", location: "Душанбе, р-н Фирдавси, ул. Рудаки, 89", price: 2500000, rooms: 4, area: 167, floor: "11/17", totalFloors: 17, type: "Новостройки", stage: "Построен", repair: "Новый ремонт", urgent: false, sold: false, images: 5, imageUrls: null,
    photos: [
      '/images/apartments/apt2_4.jpg',
      '/images/apartments/apt3_4.jpg',
      '/images/apartments/apt2_3.jpg',
      '/images/apartments/apt3_1.jpg',
      '/images/apartments/apt3_5.jpg',
    ], description: "Элитные апартаменты", seoDesc: "Элитная 4-комнатная квартира", date: "02.07.2026", agentId: 4, createdAt: new Date(), updatedAt: new Date() },
  { id: 4, title: "2-комнатная квартира 70 м² — уютный вариант", location: "Душанбе, р-н И. Сомони, ул. Низоми, 45", price: 920000, rooms: 2, area: 70, floor: "7/12", totalFloors: 12, type: "Вторичка", stage: "Построен", repair: "Разрешён ремонт", urgent: false, sold: false, images: 4, imageUrls: null,
    photos: [
      '/images/apartments/apt3_4.jpg',
      '/images/apartments/apt2_4.jpg',
      '/images/apartments/apt2_3.jpg',
      '/images/apartments/apt9_3.jpg',
      '/images/apartments/apt4_3.jpg',
    ], description: "Уютная квартира", seoDesc: "Продаётся уютная 2-комнатная", date: "03.07.2026", agentId: 5, createdAt: new Date(), updatedAt: new Date() },
  { id: 5, title: "3-комнатная квартира 96 м² для семьи", location: "Душанбе, р-н Шохмансур, ул. Дусти, 17", price: 1379000, rooms: 3, area: 96, floor: "1/9", totalFloors: 9, type: "Новостройки", stage: "Построен", repair: "Новый ремонт", urgent: true, sold: false, images: 5, imageUrls: null,
    photos: [
      '/images/apartments/apt3_5.jpg',
      '/images/apartments/apt2_4.jpg',
      '/images/apartments/apt3_4.jpg',
      '/images/apartments/apt2_1.jpg',
      '/images/apartments/apt3_1.jpg',
    ], description: "Семейная квартира", seoDesc: "Семейная 3-комнатная", date: "26.06.2026", agentId: 3, createdAt: new Date(), updatedAt: new Date() },
  { id: 6, title: "2-комнатная квартира 80 м² современный дизайн", location: "Душанбе, р-н Сино, пр. Рудаки, 156", price: 1270000, rooms: 2, area: 80, floor: "15/20", totalFloors: 20, type: "Новостройки", stage: "Построен", repair: "Новый ремонт", urgent: false, sold: false, images: 4, imageUrls: null,
    photos: [
      '/images/apartments/apt1_1.jpg',
      '/images/apartments/apt2_3.jpg',
      '/images/apartments/apt2_4.jpg',
      '/images/apartments/apt3_5.jpg',
      '/images/apartments/apt2_1.jpg',
    ], description: "Современная квартира", seoDesc: "Современная 2-комнатная", date: "03.07.2026", agentId: 6, createdAt: new Date(), updatedAt: new Date() },
  { id: 7, title: "3-комнатная квартира 104 м² просторная планировка", location: "Душанбе, ул. Айни, 77", price: 1230000, rooms: 3, area: 104, floor: "10/10", totalFloors: 10, type: "Новостройки", stage: "Построен", repair: "Разрешён ремонт", urgent: false, sold: false, images: 5, imageUrls: null,
    photos: [
      '/images/apartments/apt3_4.jpg',
      '/images/apartments/apt1_1.jpg',
      '/images/apartments/apt2_3.jpg',
      '/images/apartments/apt2_1.jpg',
      '/images/apartments/apt2_4.jpg',
    ], description: "Просторная квартира", seoDesc: "Просторная 3-комнатная", date: "03.07.2026", agentId: 1, createdAt: new Date(), updatedAt: new Date() },
  { id: 8, title: "2-комнатная квартира 63 м² бюджетный вариант", location: "Душанбе, р-н Фирдавси, ул. С. Айни", price: 550000, rooms: 2, area: 63, floor: "1/4", totalFloors: 4, type: "Вторичка", stage: "Построен", repair: "Разрешён ремонт", urgent: false, sold: false, images: 4, imageUrls: null,
    photos: [
      '/images/apartments/apt2_4.jpg',
      '/images/apartments/apt3_5.jpg',
      '/images/apartments/apt2_3.jpg',
      '/images/apartments/apt1_1.jpg',
      '/images/apartments/apt2_1.jpg',
    ], description: "Доступная квартира", seoDesc: "Доступная 2-комнатная", date: "03.07.2026", agentId: 2, createdAt: new Date(), updatedAt: new Date() },
  { id: 9, title: "4-комнатная элитная квартира 145 м²", location: "Душанбе, р-н Сино, ул. Пушкина, 22", price: 3200000, rooms: 4, area: 145, floor: "18/22", totalFloors: 22, type: "Новостройки", stage: "Построен", repair: "Новый ремонт", urgent: false, sold: false, images: 5, imageUrls: null,
    photos: [
      '/images/apartments/apt2_3.jpg',
      '/images/apartments/apt3_5.jpg',
      '/images/apartments/apt9_3.jpg',
      '/images/apartments/apt1_1.jpg',
      '/images/apartments/apt2_2.jpg',
    ], description: "Элитная квартира", seoDesc: "Элитная 4-комнатная", date: "01.07.2026", agentId: 6, createdAt: new Date(), updatedAt: new Date() },
  { id: 10, title: "1-комнатная студия 42 м² для молодых", location: "Душанбе, р-н Шохмансур, ул. Каримова, 8", price: 480000, rooms: 1, area: 42, floor: "5/9", totalFloors: 9, type: "Новостройки", stage: "Построен", repair: "Новый ремонт", urgent: true, sold: false, images: 4, imageUrls: null,
    photos: [
      '/images/apartments/apt2_1.jpg',
      '/images/apartments/apt4_3.jpg',
      '/images/apartments/apt2_4.jpg',
      '/images/apartments/apt3_4.jpg',
      '/images/apartments/apt3_1.jpg',
    ], description: "Современная студия", seoDesc: "Современная студия 42 м²", date: "04.07.2026", agentId: 3, createdAt: new Date(), updatedAt: new Date() },
  { id: 11, title: "3-комнатная квартира 110 м² с видом на город", location: "Душанбе, р-н И. Сомони, ул. Лохути, 33", price: 1580000, rooms: 3, area: 110, floor: "16/18", totalFloors: 18, type: "Новостройки", stage: "Построен", repair: "Новый ремонт", urgent: false, sold: false, images: 5, imageUrls: null,
    photos: [
      '/images/apartments/apt9_3.jpg',
      '/images/apartments/apt4_3.jpg',
      '/images/apartments/apt2_3.jpg',
      '/images/apartments/apt3_5.jpg',
      '/images/apartments/apt3_1.jpg',
    ], description: "Вид на город", seoDesc: "3-комнатная с видом", date: "02.07.2026", agentId: 1, createdAt: new Date(), updatedAt: new Date() },
  { id: 12, title: "2-комнатная квартира 75 м² комфорт-класс", location: "Душанбе, р-н Фирдавси, ул. Шевченко, 67", price: 980000, rooms: 2, area: 75, floor: "8/14", totalFloors: 14, type: "Вторичка", stage: "Построен", repair: "Разрешён ремонт", urgent: false, sold: false, images: 4, imageUrls: null,
    photos: [
      '/images/apartments/apt2_1.jpg',
      '/images/apartments/apt3_4.jpg',
      '/images/apartments/apt1_1.jpg',
      '/images/apartments/apt3_1.jpg',
      '/images/apartments/apt2_2.jpg',
    ], description: "Комфортная квартира", seoDesc: "Комфортная 2-комнатная", date: "05.07.2026", agentId: 6, createdAt: new Date(), updatedAt: new Date() },
  { id: 13, title: "3-комнатная квартира 98 м² семейный формат", location: "Душанбе, р-н Сино, ул. Маяковского, 14", price: 1420000, rooms: 3, area: 98, floor: "9/16", totalFloors: 16, type: "Новостройки", stage: "Построен", repair: "Новый ремонт", urgent: true, sold: false, images: 5, imageUrls: null,
    photos: [
      '/images/apartments/apt9_3.jpg',
      '/images/apartments/apt2_1.jpg',
      '/images/apartments/apt2_3.jpg',
      '/images/apartments/apt4_3.jpg',
      '/images/apartments/apt1_1.jpg',
    ], description: "Семейная квартира", seoDesc: "Семейная 3-комнатная", date: "04.07.2026", agentId: 4, createdAt: new Date(), updatedAt: new Date() },
  { id: 14, title: "5-комнатный пентхаус 200 м²", location: "Душанбе, р-н И. Сомони, пр. Рудаки, 201", price: 4500000, rooms: 5, area: 200, floor: "25/25", totalFloors: 25, type: "Новостройки", stage: "Построен", repair: "Новый ремонт", urgent: false, sold: false, images: 5, imageUrls: null,
    photos: [
      '/images/apartments/apt1_1.jpg',
      '/images/apartments/apt3_1.jpg',
      '/images/apartments/apt2_2.jpg',
      '/images/apartments/apt3_4.jpg',
      '/images/apartments/apt2_3.jpg',
    ], description: "Эксклюзивный пентхаус", seoDesc: "Пентхаус 200 м²", date: "01.07.2026", agentId: 1, createdAt: new Date(), updatedAt: new Date() },
  { id: 15, title: "2-комнатная квартира 68 м² стартовая цена", location: "Душанбе, р-н Шохмансур, ул. Фирдоуси, 41", price: 720000, rooms: 2, area: 68, floor: "4/9", totalFloors: 9, type: "Вторичка", stage: "Построен", repair: "Разрешён ремонт", urgent: false, sold: false, images: 4, imageUrls: null,
    photos: [
      '/images/apartments/apt2_4.jpg',
      '/images/apartments/apt3_5.jpg',
      '/images/apartments/apt2_3.jpg',
      '/images/apartments/apt9_3.jpg',
      '/images/apartments/apt3_4.jpg',
    ], description: "Стартовая цена", seoDesc: "2-комнатная 68 м²", date: "06.07.2026", agentId: 2, createdAt: new Date(), updatedAt: new Date() },
  { id: 16, title: "3-комнатная квартира 105 м² с евроремонтом", location: "Душанбе, р-н Фирдавси, ул. Бухоро, 92", price: 1350000, rooms: 3, area: 105, floor: "12/15", totalFloors: 15, type: "Новостройки", stage: "Построен", repair: "Новый ремонт", urgent: false, sold: false, images: 5, imageUrls: null,
    photos: [
      '/images/apartments/apt2_1.jpg',
      '/images/apartments/apt9_3.jpg',
      '/images/apartments/apt1_1.jpg',
      '/images/apartments/apt3_4.jpg',
      '/images/apartments/apt3_1.jpg',
    ], description: "С евроремонтом", seoDesc: "3-комнатная 105 м²", date: "03.07.2026", agentId: 3, createdAt: new Date(), updatedAt: new Date() },
];

// Demo listings above predate the details/mapAddress fields — fill sensible
// defaults once at module load so the dev site looks complete.
const DEMO_DETAILS: Record<string, string> = {
  balcony: 'Лоджия + балкон',
  bathroom: 'Раздельный',
  ceilingHeight: '2.8 м',
  windows: 'Панорамные',
  heating: 'Автономное',
  elevator: '2 лифта',
  parking: 'Подземный паркинг',
  security: 'Охрана, видеонаблюдение',
  yearBuilt: '2025',
  material: 'Монолитный каркас',
  internet: 'Оптоволокно',
  furniture: 'Частично',
  appliances: 'Встроенная техника',
};
for (const l of memoryListings) {
  if (!l.details) l.details = DEMO_DETAILS;
  if (!l.mapAddress) l.mapAddress = l.location;
}

// The DB path stores photos in imageUrls — expose the same shape here so
// the frontend never has to care which store served the listing.
function withImageUrls(listing: MemoryListing): MemoryListing {
  return { ...listing, imageUrls: listing.imageUrls ?? listing.photos ?? null };
}

// Fixtures default to published apartments. New admin-created rows can still
// be unpublished; dev mode must apply the same moderation filter as MySQL.
export function memoryFindAllListings(opts?: {
  type?: string;
  district?: string;
  rooms?: number;
  sold?: boolean;
  q?: string;
  includeUnpublished?: boolean;
  includeAllCategories?: boolean;
}) {
  let result = memoryListings.map(withImageUrls);
  if (!opts?.includeUnpublished) result = result.filter((row) => row.published !== false);
  // Mirrors findAllListings: no implicit sold=false — sold listings stay in
  // the catalog with a «Продано» badge, sorted after active ones.
  if (opts?.sold !== undefined) {
    result = result.filter(l => l.sold === opts.sold);
  }
  if (opts?.type) result = result.filter(l => l.type === opts.type);
  const district = opts?.district;
  if (district) result = result.filter(l => l.location.toLowerCase().includes(district.toLowerCase()));
  if (opts?.rooms) result = result.filter(l => l.rooms === opts.rooms);
  if (opts?.q) {
    result = result.filter(l =>
      matchesSearch(`${l.title} ${l.location} ${l.description ?? ""}`.toLowerCase(), opts.q!)
    );
  }
  return result.sort((a, b) => Number(a.sold) - Number(b.sold) || b.id - a.id);
}

export function memoryFindListingById(id: number): MemoryListing | null {
  const l = memoryListings.find(l => l.id === id);
  return l ? withImageUrls(l) : null;
}

type MemoryListingInput = Pick<MemoryListing, "title" | "location" | "price" | "rooms" | "area"> & Partial<MemoryListing>;

export function memoryCreateListing(data: MemoryListingInput): number {
  const id = nextListingId++;
  memoryListings.push({
    id,
    title: data.title,
    location: data.location,
    price: data.price,
    rooms: data.rooms,
    area: data.area,
    floor: data.floor ?? null,
    totalFloors: data.totalFloors ?? null,
    type: data.type ?? null,
    stage: data.stage ?? null,
    repair: data.repair ?? null,
    urgent: data.urgent ?? false,
    sold: false,
    published: data.published ?? true,
    category: data.category ?? "APARTMENT",
    externalId: data.externalId ?? null,
    images: data.images ?? 5,
    imageUrls: data.imageUrls ?? null,
    photos: data.photos,
    description: data.description ?? null,
    seoDesc: data.seoDesc ?? null,
    details: data.details ?? null,
    mapAddress: data.mapAddress ?? null,
    lat: data.lat ?? null,
    lng: data.lng ?? null,
    instagramUrl: data.instagramUrl ?? null,
    videoUrl: null,
    metaTitle: data.metaTitle ?? null,
    metaDescription: data.metaDescription ?? null,
    h1: data.h1 ?? null,
    descriptionTj: data.descriptionTj ?? null,
    metaTitleTj: data.metaTitleTj ?? null,
    metaDescriptionTj: data.metaDescriptionTj ?? null,
    h1Tj: data.h1Tj ?? null,
    date: data.date ?? new Date().toLocaleDateString("ru-RU"),
    agentId: data.agentId ?? null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return id;
}

export function memoryUpdateListing(id: number, data: Partial<Omit<MemoryListing, "id" | "createdAt">>) {
  const idx = memoryListings.findIndex(l => l.id === id);
  if (idx === -1) return;
  memoryListings[idx] = { ...memoryListings[idx], ...data, updatedAt: new Date() };
}

export function memoryDeleteListing(id: number) {
  const idx = memoryListings.findIndex(l => l.id === id);
  if (idx !== -1) memoryListings.splice(idx, 1);
}

export const memoryLeads: MemoryLead[] = [];

export function memoryCreateLead(data: { name?: string | null; phone: string; message?: string | null; source: string }): number {
  const id = nextLeadId++;
  memoryLeads.push({
    id,
    name: data.name ?? null,
    phone: data.phone,
    message: data.message ?? null,
    source: data.source,
    status: "new",
    crmClientId: null,
    createdAt: new Date(),
  });
  return id;
}

export function memoryFindAllLeads() {
  return [...memoryLeads].sort((a, b) => b.id - a.id);
}

export function memoryUpdateLeadStatus(id: number, status: MemoryLead["status"]) {
  const idx = memoryLeads.findIndex(l => l.id === id);
  if (idx !== -1) memoryLeads[idx].status = status;
}

export function memorySetLeadCrmClientId(id: number, crmClientId: string) {
  const idx = memoryLeads.findIndex(l => l.id === id);
  if (idx !== -1) memoryLeads[idx].crmClientId = crmClientId;
}

export function memoryFindLeadByCrmClientId(crmClientId: string) {
  return memoryLeads.find(l => l.crmClientId === crmClientId) ?? null;
}

export interface MemoryPageView {
  path: string;
  visitorId: string | null;
  createdAt: Date;
}

export const memoryPageViews: MemoryPageView[] = [];

export function memoryTrackPageView(path: string, visitorId?: string) {
  memoryPageViews.push({ path, visitorId: visitorId ?? null, createdAt: new Date() });
}

export interface MemoryListingEvent {
  listingId: number;
  kind: string;
  visitorId: string | null;
  createdAt: Date;
}

export const memoryListingEvents: MemoryListingEvent[] = [];

export function memoryTrackListingEvent(listingId: number, kind: string, visitorId?: string) {
  memoryListingEvents.push({ listingId, kind, visitorId: visitorId ?? null, createdAt: new Date() });
}
