import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  upsertListingByExternalId: vi.fn().mockResolvedValue(41),
  setListingPublishedByExternalId: vi.fn().mockResolvedValue(undefined),
  setListingSoldByExternalId: vi.fn().mockResolvedValue(undefined),
  setListingPublishedById: vi.fn().mockResolvedValue(undefined),
  setListingSoldById: vi.fn().mockResolvedValue(undefined),
  setListingCrmShortId: vi.fn().mockResolvedValue(undefined),
  setListingVideoUrl: vi.fn().mockResolvedValue(undefined),
  updateListingFactsFromCrm: vi.fn().mockResolvedValue(41),
}));
vi.mock("./queries/listings", () => mocks);

import { crmSyncApp } from "./crm-sync-router";
import { normalizeCrmVideoUrl } from "./lib/crm-video-url";

const VIDEO = "https://crm.royalhome.tj/api/v1/public/property-video/119.mp4?v=ab12cd34";
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
const savedVideo = () => (mocks.upsertListingByExternalId.mock.calls[0][1] as { videoUrl: unknown }).videoUrl;

describe("CRM sync carries the listing video (videoUrl)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRM_SYNC_API_KEY = "test-key";
  });

  it("publish saves the CRM-hosted link", async () => {
    const res = await post([{ externalId: "uuid-1", action: "publish", data: { ...data, videoUrl: VIDEO } }]);
    expect(res.status).toBe(200);
    expect(savedVideo()).toBe(VIDEO);
  });

  it("drops a foreign host, a plain-http link and credentials in the link", async () => {
    for (const videoUrl of [
      "https://evil.example.com/119.mp4",
      "https://crm.royalhome.tj.evil.example.com/119.mp4",
      "http://crm.royalhome.tj/api/v1/public/property-video/119.mp4",
      "https://user:pass@crm.royalhome.tj/119.mp4",
    ]) {
      mocks.upsertListingByExternalId.mockClear();
      const res = await post([{ externalId: "uuid-2", action: "publish", data: { ...data, videoUrl } }]);
      expect(res.status).toBe(200);
      expect(savedVideo()).toBeNull();
    }
  });

  it("a broken value does not fail the batch and clears the link", async () => {
    const res = await post([
      { externalId: "uuid-3", action: "publish", data: { ...data, videoUrl: "не ссылка" } },
    ]);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { results: unknown[] }).results[0]).toMatchObject({ ok: true });
    expect(savedVideo()).toBeNull();
  });

  it("no videoUrl in the payload clears the stored one (null reaches the upsert, not undefined)", async () => {
    await post([{ externalId: "uuid-4", action: "publish", data }]);
    expect(mocks.upsertListingByExternalId.mock.calls[0][1]).toHaveProperty("videoUrl", null);
  });

  it("a site-created listing gets the link stored (and cleared) on its native row", async () => {
    await post([{ externalId: "uuid-5", action: "publish", siteListingId: 7, data: { ...data, videoUrl: VIDEO } }]);
    expect(mocks.setListingVideoUrl).toHaveBeenLastCalledWith({ id: 7 }, VIDEO);
    await post([{ externalId: "uuid-5", action: "publish", siteListingId: 7, data }]);
    expect(mocks.setListingVideoUrl).toHaveBeenLastCalledWith({ id: 7 }, null);
  });

  it("actions without data never touch the stored video", async () => {
    await post([
      { externalId: "uuid-6", action: "unpublish" },
      { externalId: "uuid-6", action: "sold", siteListingId: 9 },
      { externalId: "uuid-6", action: "facts", facts: { repair: "Евроремонт" } },
    ]);
    expect(mocks.setListingVideoUrl).not.toHaveBeenCalled();
  });
});

describe("normalizeCrmVideoUrl", () => {
  it("accepts only an https link on the CRM host", () => {
    expect(normalizeCrmVideoUrl(VIDEO)).toBe(VIDEO);
    expect(normalizeCrmVideoUrl("https://crm.royalhome.tj:8443/a.mp4")).toBeNull();
    expect(normalizeCrmVideoUrl("https://royalhome.tj/a.mp4")).toBeNull();
    expect(normalizeCrmVideoUrl(undefined)).toBeNull();
    expect(normalizeCrmVideoUrl("")).toBeNull();
    expect(normalizeCrmVideoUrl(`${VIDEO}${"a".repeat(500)}`)).toBeNull();
  });
});
