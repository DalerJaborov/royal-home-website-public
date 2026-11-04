import { findAllListings as rawAll, findListingById as rawOne } from './listings';
import { projectVideoAvailability } from '../lib/video-availability';

/** Public read paths share the same availability view; admin/sync keep raw rows. */
export async function findAllListings(...args: Parameters<typeof rawAll>) {
  return projectVideoAvailability.many<Awaited<ReturnType<typeof rawAll>>[number]>(await rawAll(...args));
}

export async function findListingById(id: number) {
  const row = await rawOne(id);
  return row ? projectVideoAvailability(row) : null;
}
