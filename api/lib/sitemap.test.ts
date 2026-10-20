import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../queries/listings", () => ({ findAllListings: vi.fn() }));
vi.mock("../queries/cms", () => ({ getCmsEntry: vi.fn() }));
vi.mock("../queries/articles", () => ({ findPublishedArticles: vi.fn() }));
import { findAllListings } from "../queries/listings";
import { getCmsEntry } from "../queries/cms";
import { findPublishedArticles } from "../queries/articles";
import { buildSitemapXml } from "./sitemap";

beforeEach(() => {
  vi.mocked(findAllListings).mockResolvedValue([]);
  vi.mocked(getCmsEntry).mockResolvedValue(undefined);
  vi.mocked(findPublishedArticles).mockResolvedValue({ items: [], total: 0 });
});

describe("Sitemap integrity", () => {
  it("fails the whole response when inventory is unavailable", async () => {
    vi.mocked(findAllListings).mockRejectedValue(new Error("database unavailable"));
    await expect(buildSitemapXml()).rejects.toThrow("database unavailable");
  });
  it("includes articles after 500 and uses modification dates after refresh", async () => {
    const article = (n: number) => ({ slug: `statya-${n}`, updatedAt: new Date("2026-10-14"), publishedAt: new Date("2026-09-01") });
    vi.mocked(findPublishedArticles).mockImplementation(async ({ offset }) => ({
      items: (offset === 0 ? Array.from({ length: 500 }, (_, i) => article(i)) : [article(500)]) as Awaited<ReturnType<typeof findPublishedArticles>>["items"],
      total: 501,
    }));
    const xml = await buildSitemapXml();
    expect(xml).toContain("/blog/statya-500</loc><lastmod>2026-10-14</lastmod>");
    expect(vi.mocked(findPublishedArticles)).toHaveBeenLastCalledWith({ limit: 500, offset: 500 });
  });
  it("omits inactive CMS articles", async () => {
    vi.mocked(getCmsEntry).mockResolvedValue([{ id: 1, active: true }, { id: 2, active: false }]);
    const xml = await buildSitemapXml();
    expect(xml).toContain("/blog/1</loc>");
    expect(xml).not.toContain("/blog/2</loc>");
  });
});
