import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../queries/listings", () => ({ findAllListings: vi.fn() }));
vi.mock("../queries/cms", () => ({ getCmsEntry: vi.fn() }));
vi.mock("../queries/articles", () => ({ findPublishedArticles: vi.fn() }));
import { findAllListings } from "../queries/listings";
import { getCmsEntry } from "../queries/cms";
import { findPublishedArticles } from "../queries/articles";
import { buildSitemapXml } from "./sitemap";

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { headers: { 'content-type': 'video/mp4' } })));
  vi.mocked(findAllListings).mockResolvedValue([]);
  vi.mocked(getCmsEntry).mockResolvedValue(undefined);
  vi.mocked(findPublishedArticles).mockResolvedValue({ items: [], total: 0 });
});
afterEach(() => vi.unstubAllGlobals());

it('keeps the property but removes all language video entries after confirmed 404', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 404 })));
  vi.mocked(findAllListings).mockResolvedValue([{ id: 990125, title: 'Fixture', location: 'Сино', rooms: 1, area: 40, price: 1,
    imageUrls: ['/uploads/fixture.webp'], createdAt: new Date('2026-10-01'), updatedAt: new Date('2026-10-01'),
    videoUrl: 'https://crm.royalhome.tj/api/v1/public/property-video/990125.mp4' }] as never);
  const xml = await buildSitemapXml();
  expect(xml).toContain('/listing/990125</loc>');
  expect(xml).not.toContain('990125/video');
  expect(xml).not.toContain('<video:video>');
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
  it("adds the video extension only to listings with a video and a cover, escaped", async () => {
    const row = (id: number, extra: object) => ({ id, rooms: 2, area: 80, price: 800000, location: "Сино, Душанбе", title: "Квартира & <дом>", imageUrls: ["/uploads/a.jpg"], seoDesc: "Описание", createdAt: new Date("2026-10-01T20:30:00Z"), updatedAt: new Date("2026-10-02"), ...extra });
    vi.mocked(findAllListings).mockResolvedValue([
      row(1, { videoUrl: "https://crm.royalhome.tj/api/v1/public/property-video/1.mp4?a=1&b=2" }),
      row(2, { videoUrl: null }),
      row(3, { videoUrl: "https://crm.royalhome.tj/v/3.mp4", imageUrls: [] }),
    ] as unknown as Awaited<ReturnType<typeof findAllListings>>);
    const xml = await buildSitemapXml();
    expect(xml).toContain('xmlns:video="http://www.google.com/schemas/sitemap-video/1.1"');
    expect(xml.match(/<video:video>/g)).toHaveLength(3);
    const block = /<url><loc>https:\/\/royalhome.tj\/listing\/1\/video<\/loc>([\s\S]*?)<\/url>/.exec(xml)![1];
    expect(block).toContain("<video:thumbnail_loc>https://royalhome.tj/uploads/a.jpg</video:thumbnail_loc>");
    expect(block).toContain("<video:title>Видеообзор: Квартира &amp; &lt;дом&gt;</video:title>");
    expect(block).toContain("<video:content_loc>https://royalhome.tj/media/listing-video/1.mp4</video:content_loc>");
    expect(xml).toContain('/tg/khona/1/video</loc>');
    expect(xml).toContain('/en/listing/1/video</loc>');
    expect(xml).not.toContain('/listing/2/video');
    expect(xml).not.toContain('/listing/3/video');
    expect(block).toContain("<video:publication_date>2026-10-02T01:30:00+05:00</video:publication_date>");
  });
  it("omits inactive CMS articles", async () => {
    vi.mocked(getCmsEntry).mockResolvedValue([{ id: 1, active: true }, { id: 2, active: false }]);
    const xml = await buildSitemapXml();
    expect(xml).toContain("/blog/1</loc>");
    expect(xml).not.toContain("/blog/2</loc>");
  });
});
