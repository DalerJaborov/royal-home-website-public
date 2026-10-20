import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  META_GRAPH_VERSION,
  buildCapiEvent,
  buildCapiRequest,
  readCookie,
  readMetaRequestContext,
  resetMetaCapiLogThrottle,
  sendCapiEvents,
  sha256Hex,
  type MetaConfig,
} from "./meta-capi";

const TOKEN = "EAAB-super-secret-token-123";
const config: MetaConfig = {
  pixelId: "123456789012345",
  token: TOKEN,
  testEventCode: "",
};
const visitorId = "3f8b1c2a-1111-4222-8333-444455556666";

function request(headers: Record<string, string>) {
  return new Request("https://royalhome.tj/api/trpc/meta.track", {
    method: "POST",
    headers,
  });
}

describe("Conversions API payload", () => {
  it("passes event_id through and hashes the visitor id into external_id", () => {
    const event = buildCapiEvent({
      name: "ViewContent",
      eventId: "evt-12345678",
      time: 1_700_000_000,
      context: {
        ip: "203.0.113.7",
        userAgent: "UA/1",
        fbp: "fb.1.1700000000000.123456789",
        fbc: "fb.1.1700000000000.AbCd_-x",
        sourceUrl: "https://royalhome.tj/listing/5",
        visitorId,
      },
      customData: { content_type: "home_listing", content_ids: ["1042"] },
    });
    expect(event).toEqual({
      event_name: "ViewContent",
      event_time: 1_700_000_000,
      event_id: "evt-12345678",
      action_source: "website",
      event_source_url: "https://royalhome.tj/listing/5",
      user_data: {
        client_ip_address: "203.0.113.7",
        client_user_agent: "UA/1",
        fbp: "fb.1.1700000000000.123456789",
        fbc: "fb.1.1700000000000.AbCd_-x",
        external_id: [sha256Hex(visitorId)],
      },
      custom_data: { content_type: "home_listing", content_ids: ["1042"] },
    });
    expect(JSON.stringify(event)).not.toContain(visitorId);
    expect(sha256Hex(` ${visitorId.toUpperCase()} `)).toBe(
      sha256Hex(visitorId)
    );
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
  });

  it("omits what is unknown instead of sending empty strings", () => {
    const event = buildCapiEvent({
      name: "PageView",
      eventId: "evt-12345678",
      context: {},
    });
    expect(event.user_data).toEqual({});
    expect(event).not.toHaveProperty("event_source_url");
    expect(event).not.toHaveProperty("custom_data");
    expect(event.event_time).toBeGreaterThan(1_700_000_000);
  });

  it("keeps the token in the query string only, never in the body, and honours the test code", () => {
    const event = buildCapiEvent({
      name: "Lead",
      eventId: "evt-12345678",
      context: {},
    });
    const { url, init } = buildCapiRequest(
      { ...config, testEventCode: "TEST123" },
      [event]
    );
    expect(url).toBe(
      `https://graph.facebook.com/${META_GRAPH_VERSION}/123456789012345/events?access_token=${encodeURIComponent(TOKEN)}`
    );
    expect(String(init.body)).not.toContain(TOKEN);
    expect(JSON.parse(String(init.body))).toEqual({
      data: [event],
      test_event_code: "TEST123",
    });
    expect(
      JSON.parse(String(buildCapiRequest(config, [event]).init.body))
    ).not.toHaveProperty("test_event_code");
  });
});

describe("request context", () => {
  it("reads ip, user agent, page url and valid _fbp/_fbc cookies", () => {
    const ctx = readMetaRequestContext(
      request({
        "x-forwarded-for": "10.0.0.1, 203.0.113.9",
        "user-agent": "Mozilla/5.0",
        referer: "https://royalhome.tj/listing/5?utm_source=fb#gallery",
        cookie:
          "a=1; _fbp=fb.1.1700000000000.123456789; _fbc=fb.1.1700000000000.IwAR_x-1",
      }),
      visitorId
    );
    expect(ctx).toMatchObject({
      ip: "203.0.113.9",
      userAgent: "Mozilla/5.0",
      sourceUrl: "https://royalhome.tj/listing/5?utm_source=fb",
      fbp: "fb.1.1700000000000.123456789",
      fbc: "fb.1.1700000000000.IwAR_x-1",
      visitorId,
    });
  });

  it("drops malformed cookies and non-http referers", () => {
    const ctx = readMetaRequestContext(
      request({
        cookie: "_fbp=<script>; _fbc=fb.1.1.x y",
        referer: "javascript:alert(1)",
      })
    );
    expect(ctx.fbp).toBeUndefined();
    expect(ctx.fbc).toBeUndefined();
    expect(ctx.sourceUrl).toBeUndefined();
    expect(readCookie("a=1; b=2", "b")).toBe("2");
    expect(readCookie(null, "b")).toBeUndefined();
  });
});

describe("sendCapiEvents", () => {
  const event = buildCapiEvent({
    name: "PageView",
    eventId: "evt-12345678",
    context: {},
  });
  beforeEach(() => resetMetaCapiLogThrottle());
  afterEach(() => vi.restoreAllMocks());

  it("sends nothing when the pixel id or token is missing", async () => {
    const fetchImpl = vi.fn();
    await sendCapiEvents(
      { pixelId: "", token: TOKEN, testEventCode: "" },
      [event],
      fetchImpl
    );
    await sendCapiEvents(
      { pixelId: "123456789012345", token: "", testEventCode: "" },
      [event],
      fetchImpl
    );
    await sendCapiEvents(
      { pixelId: "", token: "", testEventCode: "" },
      [event],
      fetchImpl
    );
    await sendCapiEvents(config, [], fetchImpl);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("posts once to the Graph events endpoint", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        new Response('{"events_received":1}', { status: 200 })
      );
    await sendCapiEvents(config, [event], fetchImpl);
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(fetchImpl.mock.calls[0][0]).toContain("/events?access_token=");
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({
      method: "POST",
      redirect: "error",
    });
  });

  it("never throws, logs a failure once per window and never logs the token", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const failing = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              type: "OAuthException",
              code: 190,
              message: `Invalid token ${TOKEN}`,
            },
          }),
          { status: 400 }
        )
      );
    await expect(
      sendCapiEvents(config, [event], failing)
    ).resolves.toBeUndefined();
    await sendCapiEvents(config, [event], failing);
    const rejecting = vi
      .fn()
      .mockRejectedValue(
        Object.assign(new Error(`connect ${TOKEN}`), { name: "TimeoutError" })
      );
    await expect(
      sendCapiEvents(config, [event], rejecting)
    ).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledOnce();
    expect(JSON.stringify(error.mock.calls)).not.toContain(TOKEN);
    expect(String(error.mock.calls[0][0])).toContain("HTTP 400");
  });

  it("logs a network failure without the error message (which may embed the URL)", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const rejecting = vi
      .fn()
      .mockRejectedValue(new Error(`fetch failed ${TOKEN}`));
    await sendCapiEvents(config, [event], rejecting);
    expect(JSON.stringify(error.mock.calls)).not.toContain(TOKEN);
  });
});
