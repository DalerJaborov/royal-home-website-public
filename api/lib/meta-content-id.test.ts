import { describe, expect, it } from "vitest";
import { metaContentId } from "@contracts/meta-content-id";
import { projectPublicListing } from "@contracts/public-listing";

describe("Meta catalog item id = CRM card number", () => {
  it("is the CRM shortId as a string, identical to the CRM feed home_listing_id", () => {
    expect(metaContentId({ crmShortId: 1042 })).toBe("1042");
    expect(metaContentId({ crmShortId: 1 })).toBe("1");
  });

  it("never falls back to the site row id or the CRM UUID", () => {
    // `id` / `externalId` are deliberately not part of the contract any more.
    expect(
      metaContentId({
        id: 77,
        externalId: "7f1c2e0a-0000-4000-8000-000000000000",
      } as never)
    ).toBeUndefined();
    expect(metaContentId({ crmShortId: null })).toBeUndefined();
    expect(metaContentId({ crmShortId: undefined })).toBeUndefined();
    expect(metaContentId({})).toBeUndefined();
  });

  it("rejects numbers that cannot be a card number", () => {
    for (const crmShortId of [
      0,
      -5,
      1.5,
      NaN,
      Infinity,
      Number.MAX_SAFE_INTEGER + 2,
    ]) {
      expect(metaContentId({ crmShortId })).toBeUndefined();
    }
    expect(
      metaContentId({ crmShortId: "12" as unknown as number })
    ).toBeUndefined();
  });

  it("survives the public projection that the site HTML and API use", () => {
    const now = new Date();
    const base = {
      id: 9,
      title: "x",
      location: "Сино, Душанбе",
      price: 1,
      rooms: 1,
      area: 1,
      floor: null,
      type: null,
      stage: null,
      repair: null,
      urgent: false,
      sold: false,
      images: 0,
      imageUrls: null,
      seoDesc: null,
      date: null,
      createdAt: now,
      updatedAt: now,
    };
    expect(projectPublicListing({ ...base, crmShortId: 321 }).crmShortId).toBe(
      321
    );
    expect(projectPublicListing(base).crmShortId).toBeNull();
    expect(
      metaContentId(projectPublicListing({ ...base, crmShortId: 321 }))
    ).toBe("321");
  });
});
