import { useEffect } from 'react';
import { trpc } from '@/providers/trpc';
import type { Listing, ListingDetails } from '@/data/listings';
import {
  saveListingsSnapshot, loadListingsSnapshot,
  saveListingSnapshot, loadListingSnapshot,
} from '@/lib/offlineCatalog';
import { selectOfflineData } from '@/lib/offlineSelection';

// Server listing row (Drizzle/memory-store shape with joined agent fields).
interface ServerListing {
  id: number;
  crmShortId?: number | null;
  title: string;
  location: string;
  price: number;
  rooms: number;
  area: number;
  floor: string | null;
  totalFloors?: number | null;
  updatedAt?: Date | string;
  createdAt?: Date | string;
  type: 'Новостройки' | 'Вторичка' | null;
  stage: string | null;
  repair: string | null;
  urgent: boolean;
  sold: boolean;
  category?: 'APARTMENT' | 'HOUSE' | 'COMMERCIAL' | 'LAND';
  images: number;
  imageUrls: string[] | null;
  description?: string | null;
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
  date: string | null;
}

// Adapts a server row to the Listing shape the page components were built
// around, so the UI code doesn't need to know where the data came from.
export function mapServerListing(l: ServerListing): Listing {
  return {
    id: l.id,
    crmShortId: l.crmShortId ?? undefined,
    title: l.title,
    titleTj: l.title,
    location: l.location,
    price: l.price,
    rooms: l.rooms,
    area: l.area,
    floor: l.floor ?? '',
    totalFloors: l.totalFloors ?? undefined,
    updatedAt: l.updatedAt instanceof Date ? l.updatedAt.toISOString() : l.updatedAt,
    createdAt: l.createdAt instanceof Date ? l.createdAt.toISOString() : l.createdAt,
    type: l.category === 'HOUSE' || l.category === 'LAND' ? '' : l.type ?? '',
    stage: l.stage ?? '',
    repair: l.repair ?? '',
    images: l.images,
    photos: l.imageUrls ?? undefined,
    urgent: l.urgent,
    sold: l.sold,
    category: l.category ?? 'APARTMENT',
    date: l.date ?? '',
    seoDesc: l.seoDesc ?? '',
    mapAddress: l.mapAddress ?? undefined,
    lat: l.lat ?? undefined,
    lng: l.lng ?? undefined,
    instagramUrl: l.instagramUrl ?? undefined,
    videoUrl: l.videoUrl ?? undefined,
    details: (l.details ?? undefined) as ListingDetails | undefined,
    description: l.description ?? undefined,
    metaTitle: l.metaTitle ?? undefined,
    metaDescription: l.metaDescription ?? undefined,
    h1: l.h1 ?? undefined,
    descriptionTj: l.descriptionTj ?? undefined,
    metaTitleTj: l.metaTitleTj ?? undefined,
    metaDescriptionTj: l.metaDescriptionTj ?? undefined,
    h1Tj: l.h1Tj ?? undefined,
  };
}

export function useListingsData() {
  // HTML already read the current inventory. Keep that short-lived snapshot
  // fresh through the first paint instead of downloading it twice on entry.
  const query = trpc.listing.list.useQuery({}, { staleTime: 15_000 });

  useEffect(() => {
    if (query.data) saveListingsSnapshot(query.data);
  }, [query.data]);

  const selected = selectOfflineData(query, typeof navigator !== 'undefined' && !navigator.onLine,
    () => loadListingsSnapshot<ServerListing>() as typeof query.data | null);
  const rows = selected.data ?? [];
  return {
    listings: rows.map(l => mapServerListing(l as ServerListing)),
    isLoading: selected.isLoading,
    isError: selected.isError && selected.data == null,
    isOffline: selected.isOffline,
  };
}

export function useListingData(id: number) {
  const validId = Number.isSafeInteger(id) && id > 0;
  const query = trpc.listing.getById.useQuery({ id }, { enabled: validId, retry: 1, staleTime: 30_000 });
  const isNotFound = !validId || query.error?.data?.code === 'NOT_FOUND';

  useEffect(() => {
    if (query.data) saveListingSnapshot(id, query.data);
  }, [query.data, id]);

  // React Query keeps the last successful `data` around even after a later
  // refetch on the same key errors (e.g. the listing got unpublished/deleted
  // after the visitor already viewed it once this session) — without this
  // check the page kept showing the stale cached listing instead of "not found".
  const selected = selectOfflineData(query, typeof navigator !== 'undefined' && !navigator.onLine,
    () => loadListingSnapshot<ServerListing>(id) as typeof query.data | null, { rejectOnlineError: isNotFound });
  const row = selected.data;
  return {
    listing: row ? mapServerListing(row as ServerListing) : null,
    isLoading: selected.isLoading,
    isError: selected.isError,
    isOffline: selected.isOffline,
    isNotFound,
  };
}
