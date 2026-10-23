import { describe, expect, it } from "vitest";
import { dushanbeIso, listingJsonLd } from "@contracts/listing-jsonld";

describe("Property-specific structured data", () => {
  const input = { title: "Объект", images: [], url: "https://royalhome.tj/listing/1", price: 500000, rooms: 2, area: 60, sold: false };
  it("describes houses as houses and land as places without apartment-room attributes", () => {
    expect(listingJsonLd({ ...input, category: "HOUSE" }).about["@type"]).toBe("House");
    const land = listingJsonLd({ ...input, category: "LAND" });
    expect(land.about["@type"]).toBe("Place");
    expect(land.about).not.toHaveProperty("numberOfRooms");
    expect(land.breadcrumb.itemListElement).toHaveLength(3);
  });

  describe("VideoObject", () => {
    const withVideo = { ...input, images: ["https://royalhome.tj/uploads/a.jpg", "https://royalhome.tj/uploads/b.jpg"], description: "2-комнатная квартира, Сино",
      videoUrl: "https://crm.royalhome.tj/api/v1/public/property-video/1.mp4", uploadDate: new Date("2026-10-01T20:30:00Z") };
    it("is attached to the listing with every field Google requires and a +05:00 date", () => {
      expect(listingJsonLd(withVideo).video).toEqual({
        "@type": "VideoObject", name: "Объект", description: "2-комнатная квартира, Сино",
        thumbnailUrl: ["https://royalhome.tj/uploads/a.jpg"], uploadDate: "2026-10-02T01:30:00+05:00",
        contentUrl: "https://crm.royalhome.tj/api/v1/public/property-video/1.mp4", inLanguage: "ru",
      });
    });
    it("is absent without a video, a thumbnail or a valid date, so no invalid block is published", () => {
      expect(listingJsonLd({ ...withVideo, videoUrl: null })).not.toHaveProperty("video");
      expect(listingJsonLd({ ...withVideo, images: [] })).not.toHaveProperty("video");
      expect(listingJsonLd({ ...withVideo, uploadDate: undefined })).not.toHaveProperty("video");
      expect(listingJsonLd({ ...withVideo, uploadDate: "not a date" })).not.toHaveProperty("video");
    });
    it("formats Dushanbe time from Dates and ISO strings", () => {
      expect(dushanbeIso(new Date("2026-10-01T19:00:00Z"))).toBe("2026-10-02T00:00:00+05:00");
      expect(dushanbeIso("2026-10-01T19:00:00.000Z")).toBe("2026-10-02T00:00:00+05:00");
      expect(dushanbeIso(null)).toBeUndefined();
    });
  });
});
