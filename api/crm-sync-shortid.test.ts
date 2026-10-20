import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  upsertListingByExternalId: vi.fn().mockResolvedValue(41),
  setListingPublishedByExternalId: vi.fn().mockResolvedValue(undefined),
  setListingSoldByExternalId: vi.fn().mockResolvedValue(undefined),
  setListingPublishedById: vi.fn().mockResolvedValue(undefined),
  setListingSoldById: vi.fn().mockResolvedValue(undefined),
  setListingCrmShortId: vi.fn().mockResolvedValue(undefined),
  updateListingFactsFromCrm: vi.fn().mockResolvedValue(41),
}));
vi.mock("./queries/listings", () => mocks);

import { crmSyncApp } from "./crm-sync-router";

const data = {
  title: "Квартира",
  location: "Сино, Душанбе",
  price: 100000,
  rooms: 2,
  area: 60,
  category: "APARTMENT",
};
function post(items: unknown[]) {
  return crmSyncApp.request("/listings", {
    method: "POST",
    headers: { "X-Api-Key": "test-key", "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  });
}

describe("CRM sync carries the card number (shortId)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRM_SYNC_API_KEY = "test-key";
  });

  it("publish stores shortId on create/update through the upsert", async () => {
    const res = await post([
      { externalId: "uuid-1", action: "publish", shortId: 1042, data },
    ]);
    expect(res.status).toBe(200);
    expect(mocks.upsertListingByExternalId).toHaveBeenCalledWith(
      "uuid-1",
      expect.objectContaining({ crmShortId: 1042 })
    );
  });

  it("publish of a site-created listing stores shortId on the native row", async () => {
    await post([
      {
        externalId: "uuid-2",
        action: "publish",
        siteListingId: 7,
        shortId: 77,
        data,
      },
    ]);
    expect(mocks.setListingCrmShortId).toHaveBeenCalledWith({ id: 7 }, 77);
    expect(mocks.upsertListingByExternalId).not.toHaveBeenCalled();
  });

  it("any other action backfills an existing row (full resync fills crm_short_id)", async () => {
    await post([
      { externalId: "uuid-3", action: "unpublish", shortId: 5 },
      { externalId: "uuid-4", action: "sold", siteListingId: 9, shortId: 6 },
      {
        externalId: "uuid-5",
        action: "facts",
        shortId: 8,
        facts: { floor: "3" },
      },
    ]);
    expect(mocks.setListingCrmShortId).toHaveBeenCalledWith(
      { externalId: "uuid-3" },
      5
    );
    expect(mocks.setListingCrmShortId).toHaveBeenCalledWith({ id: 9 }, 6);
    expect(mocks.setListingCrmShortId).toHaveBeenCalledWith(
      { externalId: "uuid-5" },
      8
    );
  });

  it("old payloads without shortId still work and never touch the number", async () => {
    const res = await post([{ externalId: "uuid-6", action: "publish", data }]);
    expect(res.status).toBe(200);
    expect(
      mocks.upsertListingByExternalId.mock.calls[0][1].crmShortId
    ).toBeUndefined();
    expect(mocks.setListingCrmShortId).not.toHaveBeenCalled();
  });

  it("a garbage shortId is ignored instead of rejecting the whole batch", async () => {
    for (const shortId of ["abc", -3, 1.5, null]) {
      vi.clearAllMocks();
      const res = await post([
        { externalId: "uuid-7", action: "publish", shortId, data },
      ]);
      expect(res.status).toBe(200);
      expect(
        mocks.upsertListingByExternalId.mock.calls[0][1].crmShortId
      ).toBeUndefined();
    }
  });
});
