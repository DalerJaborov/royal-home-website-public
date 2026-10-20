import fs from "fs";
import path from "path";
import { getDb } from "../api/queries/connection";
import { listings, cmsEntries } from "@db/schema";
import { eq } from "drizzle-orm";

// Runs inside the container via `docker exec` with cwd /app (Dockerfile
// WORKDIR); the built frontend + its images live under dist/public there.
const PUBLIC_DIR = path.resolve(process.cwd(), "dist", "public");
const APPLY = process.argv.includes("--apply");

function hasWebp(urlPath: string): boolean {
  const ext = path.extname(urlPath).toLowerCase();
  if (![".jpg", ".jpeg", ".png"].includes(ext) || !urlPath.startsWith("/images/")) return false;
  const webpPath = path.join(PUBLIC_DIR, urlPath.slice(0, -ext.length) + ".webp");
  return fs.existsSync(webpPath);
}

function toWebp(urlPath: string): string {
  const ext = path.extname(urlPath);
  return urlPath.slice(0, -ext.length) + ".webp";
}

// Recursively walk any JSON value, rewriting strings that look like
// convertible image paths. Returns [newValue, changed].
function rewriteJson(value: unknown): [unknown, boolean] {
  if (typeof value === "string") {
    if (hasWebp(value)) return [toWebp(value), true];
    return [value, false];
  }
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((v) => {
      const [nv, c] = rewriteJson(v);
      if (c) changed = true;
      return nv;
    });
    return [changed ? next : value, changed];
  }
  if (value && typeof value === "object") {
    let changed = false;
    const next: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const [nv, c] = rewriteJson(v);
      next[k] = nv;
      if (c) changed = true;
    }
    return [changed ? next : value, changed];
  }
  return [value, false];
}

async function main() {
  const db = getDb();
  if (!db) {
    console.log("No DB connection available (DATABASE_URL missing) — nothing to do.");
    return;
  }

  console.log(APPLY ? "APPLY mode — writing changes." : "DRY RUN — no writes (pass --apply to write).");

  // Listings
  const listingRows = await db.select().from(listings);
  for (const l of listingRows) {
    if (l.imageUrls) {
      const [next, changed] = rewriteJson(l.imageUrls);
      if (changed) {
        console.log(`listing#${l.id} ${l.title}: ${JSON.stringify(l.imageUrls)} -> ${JSON.stringify(next)}`);
        if (APPLY) await db.update(listings).set({ imageUrls: next as string[] }).where(eq(listings.id, l.id));
      }
    }
  }

  // CMS entries (hero/banners/services images edited via admin)
  const cmsRows = await db.select().from(cmsEntries);
  for (const c of cmsRows) {
    const [next, changed] = rewriteJson(c.value);
    if (changed) {
      console.log(`cms[${c.key}]: changed`);
      if (APPLY) await db.update(cmsEntries).set({ value: next as object }).where(eq(cmsEntries.key, c.key));
    }
  }

  console.log("Done.");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
