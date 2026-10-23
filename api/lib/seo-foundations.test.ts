import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../queries/listings", () => ({ findListingById: vi.fn(), findAllListings: vi.fn() }));
vi.mock("../queries/cms", () => ({ getCmsEntry: vi.fn() }));
vi.mock("../queries/articles", () => ({ findPublishedArticleBySlug: vi.fn(), findPublishedArticles: vi.fn() }));

import { findListingById, findAllListings } from "../queries/listings";
import { getCmsEntry } from "../queries/cms";
import { findPublishedArticleBySlug, findPublishedArticles } from "../queries/articles";
import { headForPath, injectSeo } from "./prerenderSeo";

const listing = {
  id: 101, title: "Квартира $& <окна>", location: "Сино, Душанбе", price: 800000,
  rooms: 2, area: 84, type: "Новостройки", category: "APARTMENT", sold: false,
  published: true, description: "Настоящее описание объекта", imageUrls: [],
} as unknown as Awaited<ReturnType<typeof findListingById>>;

beforeEach(() => {
  vi.mocked(findListingById).mockResolvedValue(listing);
  vi.mocked(findAllListings).mockResolvedValue([listing!] as Awaited<ReturnType<typeof findAllListings>>);
  vi.mocked(getCmsEntry).mockResolvedValue(undefined);
  vi.mocked(findPublishedArticles).mockResolvedValue({ items: [], total: 0 });
});

const template = '<html><head><title>Home</title><meta name="description" content="Home" /><meta name="robots" content="index, follow" /><link rel="canonical" href="https://royalhome.tj/" /></head><body><div id="root"></div></body></html>';

describe("SEO public HTML", () => {
  it("injects literal replacement tokens without interpreting them as regex captures", () => {
    const html = injectSeo(template, { title: "$& $1 <тест>", description: "$& $1", image: "/image.jpg", url: "https://royalhome.tj/", type: "website" });
    expect(html).toContain('<title>$&amp; $1 &lt;тест&gt;</title>');
    expect(html).toContain('name="description" content="$&amp; $1"');
    expect(html.match(/<title>/g)).toHaveLength(1);
  });

  it("catalog filters are noindex on the server while campaigns stay canonical and indexable", async () => {
    for (const query of ["rooms=2", "district=Сино", "category=HOUSE", "page=2", "q=кухня"]) {
      expect((await headForPath(`/listings?${query}`)).noindex).toBe(true);
    }
    const head = await headForPath("/listings?utm_source=google&gclid=test");
    expect(head.noindex).toBe(false);
    expect(head.url).toBe("https://royalhome.tj/listings");
    expect(head.body).toContain('href="/listing/101"');
    expect(head.body).toContain("800");
  });

  it("public listing text and links are present without JavaScript, with escaped CMS values", async () => {
    const html = injectSeo(template, await headForPath("/listing/101"));
    expect(html).toContain("Настоящее описание объекта");
    expect(html).toContain("Квартира $&amp; &lt;окна&gt;");
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).not.toContain('<div id="root"></div>');
  });

  it("listing with a video carries VideoObject in the server HTML, escaped, and without it carries none", async () => {
    const jsonLdOf = (html: string) => JSON.parse(/<script type="application\/ld\+json" id="seo-page-jsonld">([\s\S]*?)<\/script>/.exec(html)![1]);
    const withVideo = {
      ...listing!, title: 'Квартира </script><b>x</b>', floor: "7/9", location: "Сино, Душанбе",
      imageUrls: ["/uploads/a.jpg"], videoUrl: "https://crm.royalhome.tj/api/v1/public/property-video/101.mp4?v=ab12",
      createdAt: new Date("2026-10-01T20:30:00Z"),
    } as unknown as Awaited<ReturnType<typeof findListingById>>;
    vi.mocked(findListingById).mockResolvedValue(withVideo);
    const html = injectSeo(template, await headForPath("/listing/101"));
    expect(html.match(/<\/script>/g)).toHaveLength(1);
    const video = jsonLdOf(html).video;
    expect(video).toMatchObject({
      "@type": "VideoObject", name: 'Квартира </script><b>x</b>', thumbnailUrl: ["https://royalhome.tj/uploads/a.jpg"],
      uploadDate: "2026-10-02T01:30:00+05:00", contentUrl: "https://crm.royalhome.tj/api/v1/public/property-video/101.mp4?v=ab12",
    });
    expect(JSON.stringify(video)).not.toMatch(/Рудаки|7\/9/);

    vi.mocked(findListingById).mockResolvedValue({ ...withVideo!, videoUrl: null } as typeof withVideo);
    expect(jsonLdOf(injectSeo(template, await headForPath("/listing/101")))).not.toHaveProperty("video");
  });

  it("unpublished objects are 404 without exposing listing text", async () => {
    vi.mocked(findListingById).mockResolvedValue({ ...listing!, published: false });
    const head = await headForPath("/listing/101");
    expect(head.status).toBe(404);
    expect(head.noindex).toBe(true);
    expect(head.body).toContain("Страница не найдена");
    expect(head.body).not.toContain(listing!.title);
    expect(injectSeo(template, head)).not.toContain('rel="canonical"');
  });

  it("sold objects use an honest archive title and sold-out offer", async () => {
    vi.mocked(findListingById).mockResolvedValue({ ...listing!, sold: true });
    const head = await headForPath("/listing/101");
    expect(head.title).toMatch(/^Продано:/);
    expect(head.body).toContain("Архив объявления");
    expect(JSON.stringify(head.jsonLd)).toContain("SoldOut");
    expect(JSON.stringify(head.jsonLd)).toContain("RealEstateListing");
  });

  it("data failures return retryable 503 instead of an indexed success page", async () => {
    vi.mocked(findListingById).mockRejectedValue(new Error("unavailable"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await headForPath("/listing/101")).status).toBe(503);
    log.mockRestore();
  });

  it("article fallback is readable and sanitizes legacy content before HTML injection", async () => {
    vi.mocked(findPublishedArticleBySlug).mockResolvedValue({
      title: "Статья", contentHtml: '<p>Полезный текст</p><script>alert(1)</script><img src="x" onerror="alert(2)">',
      publishedAt: new Date("2026-10-01"), updatedAt: new Date("2026-10-14"),
    } as Awaited<ReturnType<typeof findPublishedArticleBySlug>>);
    const head = await headForPath("/blog/poleznaya-statya");
    expect(head.body).toContain("Полезный текст");
    expect(head.body).not.toContain("<script>");
    expect(head.body).not.toContain("onerror");
  });

  it("stored CMS page metadata reaches raw HTML rather than appearing only after JavaScript", async () => {
    vi.mocked(getCmsEntry).mockImplementation(async (key) => key === "site"
      ? { pageSeo: { listings: { title: "Каталог с ценами — ROYAL HOME", description: "Описание каталога из CMS" } } }
      : undefined);
    const head = await headForPath("https://royalhome.tj/listings");
    expect(head.title).toBe("Каталог с ценами — ROYAL HOME");
    expect(head.description).toBe("Описание каталога из CMS");
  });

  it("primary static pages contain actual visible headings and links before JavaScript starts", async () => {
    vi.mocked(getCmsEntry).mockImplementation(async (key) => key === "hero"
      ? { title: "СВОЙ", titleHighlight: "ДОМ", subtitle: "Описание из действующего CMS" }
      : key === "site" ? { phone: "+992 123 45 67 89", address: "Адрес офиса из CMS" } : undefined);
    for (const path of ["/", "/services", "/contacts", "/about", "/mortgage", "/sell", "/privacy"]) {
      const head = await headForPath(path);
      expect(head.body, path).toMatch(/<h1\b/);
      expect(head.body, path).toContain('href="/listings"');
    }
    const home = await headForPath("/");
    expect(home.body).toContain("СВОЙ ДОМ");
    expect(home.body).toContain("Описание из действующего CMS");
    expect((await headForPath("/contacts")).body).toContain("Адрес офиса из CMS");
  });
});
