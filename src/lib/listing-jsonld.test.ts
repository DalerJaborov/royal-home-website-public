import { describe, expect, it } from "vitest";
import { listingJsonLd } from "@contracts/listing-jsonld";

describe("Property-specific structured data", () => {
  const input = { title: "Объект", images: [], url: "https://royalhome.tj/listing/1", price: 500000, rooms: 2, area: 60, sold: false };
  it("describes houses as houses and land as places without apartment-room attributes", () => {
    expect(listingJsonLd({ ...input, category: "HOUSE" }).about["@type"]).toBe("House");
    const land = listingJsonLd({ ...input, category: "LAND" });
    expect(land.about["@type"]).toBe("Place");
    expect(land.about).not.toHaveProperty("numberOfRooms");
    expect(land.breadcrumb.itemListElement).toHaveLength(3);
  });
});
