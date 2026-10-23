import { afterEach, describe, expect, it, vi } from "vitest";

// Env is read once when boot.ts is imported, so each case loads a fresh copy of the app.
async function cspWith(pixelId: string | undefined) {
  vi.resetModules();
  if (pixelId === undefined) vi.stubEnv("META_PIXEL_ID", "");
  else vi.stubEnv("META_PIXEL_ID", pixelId);
  const { default: app } = await import("./boot");
  const res = await app.request("/api/does-not-exist");
  const csp = res.headers.get("Content-Security-Policy") ?? "";
  const directive = (name: string) =>
    csp
      .split(";")
      .map(part => part.trim())
      .find(part => part.startsWith(`${name} `)) ?? "";
  return {
    csp,
    script: directive("script-src"),
    img: directive("img-src"),
    connect: directive("connect-src"),
    media: directive("media-src"),
  };
}

describe("CSP and listing video", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("lets the listing page play the CRM-hosted mp4 and nothing broader", async () => {
    const { media } = await cspWith(undefined);
    expect(media).toContain("'self'");
    expect(media).toContain("https://crm.royalhome.tj");
    expect(media).toContain("https://*.cdninstagram.com");
    expect(media).not.toContain("http:");
    expect(media).not.toContain("data:");
    expect(media).not.toContain("https://* ");
  }, 60_000);
});

describe("CSP and the Meta Pixel", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("allows the Facebook hosts only when META_PIXEL_ID is configured", async () => {
    const on = await cspWith("123456789012345");
    expect(on.script).toContain("https://connect.facebook.net");
    expect(on.img).toContain("https://www.facebook.com");
    expect(on.connect).toContain("https://www.facebook.com");
    expect(on.script).not.toContain("'unsafe-inline'");
    expect(on.script).not.toContain("'unsafe-eval'");
  }, 60_000);

  it("is unchanged when the pixel is off or the id is malformed", async () => {
    for (const id of [undefined, "not-a-pixel-id"]) {
      const off = await cspWith(id);
      expect(off.csp).not.toContain("facebook.com");
      expect(off.csp).not.toContain("facebook.net");
    }
  }, 60_000);
});
