import { normalizeCompanyPublicValue } from './company-contacts';

// The complete details contract from db/schema.ts and AdminListingForm.
export const PUBLIC_DETAIL_KEYS = [
  'district', 'balcony', 'bathroom', 'ceilingHeight', 'windows', 'heating',
  'elevator', 'parking', 'security', 'yearBuilt', 'material', 'internet',
  'furniture', 'appliances',
] as const;

export interface PublicListingSource {
  id: number;
  title: string;
  location: string;
  price: number;
  rooms: number;
  area: number;
  floor: string | null;
  totalFloors?: number | null;
  type: 'Новостройки' | 'Вторичка' | null;
  stage: string | null;
  repair: string | null;
  urgent: boolean;
  sold: boolean;
  published?: boolean;
  category?: 'APARTMENT' | 'HOUSE' | 'COMMERCIAL' | 'LAND';
  /** CRM card number — the only listing number shown to visitors (see listingNumber). */
  crmShortId?: number | null;
  images: number;
  imageUrls: string[] | null | undefined;
  description?: string | null;
  seoDesc: string | null;
  details?: Record<string, string> | null;
  instagramUrl?: string | null;
  videoUrl?: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  h1?: string | null;
  descriptionTj?: string | null;
  metaTitleTj?: string | null;
  metaDescriptionTj?: string | null;
  h1Tj?: string | null;
  date: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicListing extends PublicListingSource {
  imageUrls: string[] | null;
  totalFloors: number | null;
  published: boolean;
  category: NonNullable<PublicListingSource['category']>;
  crmShortId: number | null;
  description: string | null;
  details: Record<string, string> | null;
  instagramUrl: string | null;
  videoUrl: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  h1: string | null;
  descriptionTj: string | null;
  metaTitleTj: string | null;
  metaDescriptionTj: string | null;
  h1Tj: string | null;
  externalId: null;
  mapAddress: null;
  lat: null;
  lng: null;
}

/** Public API and initial HTML share this explicit privacy boundary. Admin rows
 * never pass through it. Dates remain Dates for the existing tRPC transformer. */
export function projectPublicListing(row: PublicListingSource): PublicListing {
  const details = row.details == null ? null : Object.fromEntries(
    PUBLIC_DETAIL_KEYS.filter(key => typeof row.details?.[key] === 'string')
      .map(key => [key, row.details![key]]),
  );
  return normalizeCompanyPublicValue({
    id: row.id, title: row.title, location: row.location, price: row.price,
    rooms: row.rooms, area: row.area, floor: row.floor,
    totalFloors: row.totalFloors ?? null, type: row.type, stage: row.stage,
    repair: row.repair, urgent: row.urgent, sold: row.sold,
    published: row.published ?? true, category: row.category ?? 'APARTMENT',
    crmShortId: row.crmShortId ?? null,
    images: row.images, imageUrls: row.imageUrls ?? null,
    description: row.description ?? null, seoDesc: row.seoDesc, details,
    instagramUrl: row.instagramUrl ?? null, videoUrl: row.videoUrl ?? null, metaTitle: row.metaTitle ?? null,
    metaDescription: row.metaDescription ?? null, h1: row.h1 ?? null,
    descriptionTj: row.descriptionTj ?? null, metaTitleTj: row.metaTitleTj ?? null,
    metaDescriptionTj: row.metaDescriptionTj ?? null, h1Tj: row.h1Tj ?? null,
    date: row.date, createdAt: row.createdAt, updatedAt: row.updatedAt,
    externalId: null, mapAddress: null, lat: null, lng: null,
  });
}
