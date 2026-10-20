import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../lib/env", () => ({ env: { databaseUrl: "", isProduction: false } }));
const cms = vi.hoisted(() => ({ getCmsEntry: vi.fn() }));
vi.mock("./cms", () => cms);
import { findAllListings, findListingById } from "./listings";
import { memoryCreateListing, memoryDeleteListing } from "./memory-store";
import { buildListingSeoMeta } from '../lib/seo';
beforeEach(() => { cms.getCmsEntry.mockReset(); });
describe("catalog category visibility", () => {
  it('catalog and detail repair the same stale automatic description without a write', async () => {
    const facts = { title: 'Квартира', location: 'Сино, Душанбе', price: 1200000, rooms: 2, area: 84 };
    const old = buildListingSeoMeta({ ...facts, district: 'Сино', price: 1438400 }).metaDescription;
    const id = memoryCreateListing({ ...facts, metaDescription: old, seoDesc: old });
    try {
      const detail = await findListingById(id);
      const catalog = (await findAllListings()).find(row => row.id === id);
      expect(detail?.metaDescription).toBe(buildListingSeoMeta({ ...facts, district: 'Сино' }).metaDescription);
      expect(catalog?.metaDescription).toBe(detail?.metaDescription);
    } finally { memoryDeleteListing(id); }
  });
  it("all disabled categories give an empty catalog", async () => {
    cms.getCmsEntry.mockResolvedValue({ APARTMENT: false, HOUSE: false, COMMERCIAL: false, LAND: false });
    expect((await findAllListings()).length).toBe(0);
  });
  it("admin bypass can still inspect hidden categories", async () => {
    cms.getCmsEntry.mockResolvedValue({ APARTMENT: false, HOUSE: false, COMMERCIAL: false, LAND: false });
    expect((await findAllListings({ includeAllCategories: true })).length).toBeGreaterThan(0);
  });
  it("unpublished admin-created rows stay hidden in development too", async () => {
    const id = memoryCreateListing({ title: "Hidden fixture", location: "Test location", price: 100, rooms: 2, area: 50, published: false });
    try {
      expect((await findAllListings()).some((row) => row.id === id)).toBe(false);
      expect((await findAllListings({ includeUnpublished: true })).some((row) => row.id === id)).toBe(true);
    } finally { memoryDeleteListing(id); }
  });
});
