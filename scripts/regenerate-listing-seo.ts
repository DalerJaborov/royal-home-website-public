import { getDb } from "../api/queries/connection";
import { listings } from "@db/schema";
import { eq } from "drizzle-orm";
import { buildListingSeoMeta } from "../api/lib/seo";

// One-off correction after fixing buildListingSeoMeta (api/lib/seo.ts): the
// generator ignored listing.category entirely, so every listing synced from
// CRM — house, land plot, commercial unit, not just apartments — got a
// metaTitle/metaDescription/h1 that literally called it "N-комнатную
// квартиру" (an apartment). New/updated listings get the fix automatically;
// this backfills the metaTitle/metaDescription/h1/seoDesc already stored for
// existing rows so the site doesn't keep serving the wrong text until each
// object happens to be republished from the CRM.
const APPLY = process.argv.includes("--apply");

async function main() {
  const db = getDb();
  if (!db) {
    console.log("No DB connection available (DATABASE_URL missing) — nothing to do.");
    return;
  }

  console.log(APPLY ? "APPLY mode — writing changes." : "DRY RUN — no writes (pass --apply to write).");

  const rows = await db.select().from(listings);
  for (const l of rows) {
    const seo = buildListingSeoMeta({
      title: l.title,
      location: l.location,
      price: l.price,
      rooms: l.rooms,
      area: l.area,
      type: l.type ?? undefined,
      category: l.category,
      district: l.location.split(",")[0]?.trim(),
    });
    const changed =
      l.metaTitle !== seo.metaTitle || l.metaDescription !== seo.metaDescription || l.h1 !== seo.h1;
    if (!changed) continue;
    console.log(`listing#${l.id} ${l.title} (${l.category}):`);
    console.log(`  metaTitle: ${JSON.stringify(l.metaTitle)} -> ${JSON.stringify(seo.metaTitle)}`);
    console.log(`  h1: ${JSON.stringify(l.h1)} -> ${JSON.stringify(seo.h1)}`);
    console.log(`  metaDescription: ${JSON.stringify(l.metaDescription)} -> ${JSON.stringify(seo.metaDescription)}`);
    if (APPLY) {
      await db
        .update(listings)
        .set({ metaTitle: seo.metaTitle, metaDescription: seo.metaDescription, h1: seo.h1, seoDesc: seo.metaDescription })
        .where(eq(listings.id, l.id));
    }
  }

  console.log("Done.");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
