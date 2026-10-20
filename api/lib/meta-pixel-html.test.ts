import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { injectMetaPixel, metaPixelCspSources } from "./meta-pixel-html";

const loader = readFileSync(
  new URL("../../public/meta-pixel-loader.js", import.meta.url),
  "utf8"
);
const html = "<html><head><title>x</title>\n  </head><body></body></html>";

describe("server-rendered pixel tags", () => {
  it("adds the config meta and the same-origin loader only when a valid pixel id is set", () => {
    const out = injectMetaPixel(html, "123456789012345", "/");
    expect(out).toContain(
      '<meta name="meta-pixel-id" content="123456789012345">'
    );
    expect(out).toContain(
      '<script src="/meta-pixel-loader.js" defer></script>'
    );
    expect(out.indexOf("meta-pixel-loader")).toBeLessThan(
      out.indexOf("</head>")
    );
  });

  it("versions the loader URL so a changed loader is not served from the 30-day cache", () => {
    expect(
      injectMetaPixel(html, "123456789012345", "/", "abcdef123456")
    ).toContain('src="/meta-pixel-loader.js?v=abcdef123456"');
    expect(injectMetaPixel(html, "123456789012345", "/", '"><x')).toContain(
      'src="/meta-pixel-loader.js"'
    );
  });

  it("leaves the page byte-identical without a pixel id, with a malformed id, or on admin routes", () => {
    expect(injectMetaPixel(html, "", "/")).toBe(html);
    expect(injectMetaPixel(html, '12"><script>', "/")).toBe(html);
    expect(injectMetaPixel(html, "123456789012345", "/admin/leads")).toBe(html);
  });
});

describe("Content-Security-Policy sources for Meta", () => {
  it("contains the Facebook hosts the pixel needs when enabled", () => {
    const csp = metaPixelCspSources(true);
    expect(csp.script).toContain("https://connect.facebook.net");
    expect(csp.img).toContain("https://www.facebook.com");
    expect(csp.connect).toContain("https://www.facebook.com");
    expect(csp.script).not.toContain("unsafe");
  });
  it("adds nothing when the pixel is off", () => {
    expect(metaPixelCspSources(false)).toEqual({
      script: "",
      img: "",
      connect: "",
    });
  });
});

/** Minimal browser double for the loader. */
function run(
  options: {
    pixelId?: string;
    search?: string;
    cookie?: string;
    protocol?: string;
  } = {}
) {
  const scripts: Record<string, unknown>[] = [];
  const calls: unknown[][] = [];
  const document = {
    cookie: options.cookie ?? "",
    querySelector: () =>
      options.pixelId === undefined
        ? null
        : { getAttribute: () => options.pixelId },
    createElement: () => ({}) as Record<string, unknown>,
    head: {
      appendChild: (script: Record<string, unknown>) => scripts.push(script),
    },
  };
  const window: Record<string, unknown> = {
    location: {
      search: options.search ?? "",
      protocol: options.protocol ?? "https:",
    },
  };
  runInNewContext(loader, { window, document, URLSearchParams, Date });
  const fbq = window.fbq as
    (((...args: unknown[]) => void) & { queue: unknown[][] }) | undefined;
  return { window, document, scripts, fbq, calls };
}

describe("meta-pixel-loader.js", () => {
  it("does nothing without a pixel id meta, or with a malformed one", () => {
    for (const pixelId of [undefined, "", "abc", "12"]) {
      const { window, scripts } = run({ pixelId });
      expect(window.fbq).toBeUndefined();
      expect(window.rhMetaPixel).toBeUndefined();
      expect(scripts).toHaveLength(0);
    }
  });

  it("defines only a queueing fbq stub on load: no network, no PageView", () => {
    const { window, scripts, fbq } = run({ pixelId: "123456789012345" });
    expect(scripts).toHaveLength(0);
    expect(fbq?.queue).toHaveLength(0);
    (window.fbq as (...args: unknown[]) => void)("track", "ViewContent", { content_ids: ["1"] });
    expect((window.fbq as unknown as { queue: unknown[] }).queue).toHaveLength(
      1
    );
  });

  it("start() loads fbevents.js once, disables auto events and never sends PageView itself", () => {
    const { window, scripts, fbq } = run({ pixelId: "123456789012345" });
    const rh = window.rhMetaPixel as { start: () => void };
    rh.start();
    rh.start();
    expect(scripts).toHaveLength(1);
    expect(scripts[0]).toMatchObject({
      src: "https://connect.facebook.net/en_US/fbevents.js",
      async: true,
    });
    const queued = Array.from(fbq!.queue, args =>
      Array.from(args as ArrayLike<unknown>)
    );
    expect(queued).toEqual([
      ["set", "autoConfig", false, "123456789012345"],
      ["init", "123456789012345"],
    ]);
  });

  it("derives _fbc from fbclid in the documented format, only when the cookie is absent", () => {
    const fresh = run({
      pixelId: "123456789012345",
      search: "?fbclid=IwAR_abc-123&utm_source=fb",
    });
    (fresh.window.rhMetaPixel as { start: () => void }).start();
    expect(fresh.document.cookie).toMatch(
      /^_fbc=fb\.1\.\d{13}\.IwAR_abc-123; max-age=\d+; path=\/; SameSite=Lax; Secure$/
    );

    const existing = run({
      pixelId: "123456789012345",
      search: "?fbclid=other",
      cookie: "a=1; _fbc=fb.1.1.keep",
    });
    (existing.window.rhMetaPixel as { start: () => void }).start();
    expect(existing.document.cookie).toBe("a=1; _fbc=fb.1.1.keep");

    const hostile = run({
      pixelId: "123456789012345",
      search: "?fbclid=a;b%20c",
    });
    (hostile.window.rhMetaPixel as { start: () => void }).start();
    expect(hostile.document.cookie).toBe("");
  });
});
