import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("CRM_NOTIFY_URL", "https://crm.example.test/api/v1/webhooks/site-listing-changed");
  vi.stubEnv("CRM_LEAD_API_KEY", "isolated-test-key");
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("site to CRM listing notifications", () => {
  it("records HTTP rejection instead of silently claiming delivery", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("private payload", { status: 400 })));
    const { notifyCrmOfListingChange } = await import("./notifyCrm");
    notifyCrmOfListingChange({ externalId: "test-id", action: "deleted" });
    await vi.waitFor(() => expect(log).toHaveBeenCalled());
    expect(JSON.stringify(log.mock.calls)).not.toContain("private payload");
  });
  it("upsert rejects redirects and records HTTP outages without exposing secrets", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    const { notifyCrmOfListingUpsert } = await import("./notifyCrm");
    notifyCrmOfListingUpsert({ siteListingId: 123, action: "deleted" });
    await vi.waitFor(() => expect(log).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][1].redirect).toBe("error");
    expect(JSON.stringify(log.mock.calls)).not.toContain("isolated-test-key");
  });
});
