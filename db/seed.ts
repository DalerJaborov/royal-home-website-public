import { getDb } from "../api/queries/connection";
import { listings } from "./schema";
// Single source of truth for demo data — the same listings the site
// shows in dev mode (no DATABASE_URL), so dev and freshly-seeded prod match.
import { memoryListings } from "../api/queries/memory-store";

async function seed() {
  const db = getDb();
  if (!db) {
    console.log("No database connection — skipping seed.");
    return;
  }
  console.log("Seeding database...");

  // Listings
  const existingListings = await db.select().from(listings);
  if (existingListings.length === 0) {
    console.log(`Inserting ${memoryListings.length} listings...`);
    await db.insert(listings).values(
      memoryListings.map((l) => ({
        title: l.title,
        location: l.location,
        price: l.price,
        rooms: l.rooms,
        area: l.area,
        floor: l.floor,
        totalFloors: l.totalFloors,
        type: l.type,
        stage: l.stage,
        repair: l.repair,
        urgent: l.urgent,
        sold: l.sold,
        images: l.images,
        imageUrls: l.photos ?? null,
        description: l.description,
        seoDesc: l.seoDesc,
        details: l.details ?? null,
        mapAddress: l.mapAddress ?? l.location,
        date: l.date,
      }))
    );
  }

  console.log("Seed complete!");
}

seed().catch(console.error);
