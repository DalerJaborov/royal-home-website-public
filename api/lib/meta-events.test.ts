import { describe, expect, it, vi } from "vitest";
import {
  recordMetaEvents,
  type MetaAction,
  type MetaEventDeps,
} from "./meta-events";
import type { CapiEvent } from "./meta-capi";

const request = new Request("https://royalhome.tj/api/trpc/meta.track", {
  method: "POST",
  headers: {
    "user-agent": "UA",
    referer: "https://royalhome.tj/listing/5",
    "x-forwarded-for": "203.0.113.5",
  },
});
const ids = new Map([
  [5, "1042"],
  [6, "1043"],
  [7, "1044"],
]);

function deps(overrides: Partial<MetaEventDeps> = {}) {
  const sent: CapiEvent[][] = [];
  const value: MetaEventDeps = {
    config: { pixelId: "123456789012345", token: "tok", testEventCode: "" },
    resolveContentIds: vi.fn(
      async (wanted: number[]) =>
        new Map(
          wanted.flatMap(id =>
            ids.has(id) ? [[id, ids.get(id)!] as const] : []
          )
        )
    ),
    send: vi.fn(async (events: CapiEvent[]) => {
      sent.push(events);
    }),
    ...overrides,
  };
  return { value, sent };
}
const run = (
  action: MetaAction,
  d: MetaEventDeps,
  extra: { isAdmin?: boolean } = {}
) =>
  recordMetaEvents(
    {
      action,
      eventId: "evt-12345678",
      req: request,
      visitorId: "3f8b1c2a-1111-4222-8333-444455556666",
      ...extra,
    },
    d
  );

describe("catalog events per visitor action", () => {
  it("ViewContent: content_ids from the CRM card number, listing geo, same id in the CAPI copy", async () => {
    const { value, sent } = deps();
    const events = await run({ kind: "ViewContent", listingId: 5 }, value);
    expect(events).toEqual([
      {
        name: "ViewContent",
        params: {
          content_type: "home_listing",
          content_ids: ["1042"],
          city: "Dushanbe",
          region: "Dushanbe",
          country: "Tajikistan",
        },
      },
    ]);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toHaveLength(1);
    expect(sent[0][0]).toMatchObject({
      event_name: "ViewContent",
      event_id: "evt-12345678",
      action_source: "website",
      event_source_url: "https://royalhome.tj/listing/5",
    });
    expect(sent[0][0].user_data).toMatchObject({
      client_ip_address: "203.0.113.5",
      client_user_agent: "UA",
    });
    expect(sent[0][0].custom_data).toEqual(events[0].params);
  });

  it("Search: top ids in visitor order, unknown ids dropped, filters passed along", async () => {
    const { value } = deps();
    const events = await run(
      {
        kind: "Search",
        listingIds: [7, 999, 5, 6],
        searchString: "сино",
        district: "Сино",
      },
      value
    );
    expect(events).toHaveLength(1);
    expect(events[0].params).toMatchObject({
      content_type: "home_listing",
      content_ids: ["1044", "1042", "1043"],
      city: "Dushanbe",
      country: "Tajikistan",
      search_string: "сино",
      neighborhood: "Сино",
    });
  });

  it("Search caps at ten ids and skips entirely when nothing maps to a catalog id", async () => {
    const { value } = deps();
    const resolve = vi.fn(async () => new Map<number, string>());
    expect(
      await run(
        { kind: "Search", listingIds: [1, 2, 3] },
        { ...value, resolveContentIds: resolve }
      )
    ).toEqual([]);
    await run(
      {
        kind: "Search",
        listingIds: Array.from({ length: 25 }, (_, i) => i + 1),
      },
      { ...value, resolveContentIds: resolve }
    );
    expect((resolve.mock.calls[1] as unknown as [number[]])[0]).toHaveLength(
      10
    );
  });

  it("favorite -> InitiateCheckout", async () => {
    const { value } = deps();
    expect(
      await run({ kind: "InitiateCheckout", listingId: 6 }, value)
    ).toEqual([
      {
        name: "InitiateCheckout",
        params: { content_type: "home_listing", content_ids: ["1043"] },
      },
    ]);
  });

  it("agent contact -> Purchase (value 0 USD) + Contact, one shared event id", async () => {
    const { value, sent } = deps();
    const events = await run({ kind: "Contact", listingId: 5 }, value);
    expect(events.map(e => e.name)).toEqual(["Purchase", "Contact"]);
    expect(events[0].params).toEqual({
      content_type: "home_listing",
      content_ids: ["1042"],
      value: 0,
      currency: "USD",
    });
    expect(sent[0].map(e => e.event_id)).toEqual([
      "evt-12345678",
      "evt-12345678",
    ]);
    expect(sent[0].map(e => e.event_name)).toEqual(["Purchase", "Contact"]);
  });

  it("lead with a listing -> Lead + Purchase; lead without one (or with an unmapped one) -> only Lead", async () => {
    const { value } = deps();
    expect(
      (await run({ kind: "Lead", listingId: 5 }, value)).map(e => e.name)
    ).toEqual(["Lead", "Purchase"]);
    expect(await run({ kind: "Lead" }, value)).toEqual([
      { name: "Lead", params: {} },
    ]);
    expect(await run({ kind: "Lead", listingId: 999 }, value)).toEqual([
      { name: "Lead", params: {} },
    ]);
  });

  it("listings without a CRM card number produce no content-id events", async () => {
    const { value, sent } = deps();
    for (const action of [
      { kind: "ViewContent", listingId: 999 },
      { kind: "InitiateCheckout", listingId: 999 },
      { kind: "Contact", listingId: 999 },
    ] as MetaAction[])
      expect(await run(action, value)).toEqual([]);
    expect(sent).toHaveLength(0);
  });

  it("PageView needs no listing lookup", async () => {
    const { value } = deps();
    expect(await run({ kind: "PageView" }, value)).toEqual([
      { name: "PageView", params: {} },
    ]);
    expect(value.resolveContentIds).not.toHaveBeenCalled();
  });
});

describe("safe defaults", () => {
  it("does nothing when the pixel id is not configured: no events, no lookup, no send", async () => {
    const { value } = deps({
      config: { pixelId: "", token: "tok", testEventCode: "" },
    });
    expect(await run({ kind: "ViewContent", listingId: 5 }, value)).toEqual([]);
    expect(value.resolveContentIds).not.toHaveBeenCalled();
    expect(value.send).not.toHaveBeenCalled();
  });

  it("never tracks admins", async () => {
    const { value } = deps();
    expect(await run({ kind: "PageView" }, value, { isAdmin: true })).toEqual(
      []
    );
    expect(value.send).not.toHaveBeenCalled();
  });

  it("without a token the browser still gets its events (pixel only) and nothing is sent server-side", async () => {
    // The transport is a no-op without a token (see sendCapiEvents); events are still returned.
    const { value } = deps({
      config: { pixelId: "123456789012345", token: "", testEventCode: "" },
    });
    expect(await run({ kind: "PageView" }, value)).toHaveLength(1);
  });

  it("a failing lookup or sender never fails the visitor request", async () => {
    const { value } = deps({
      resolveContentIds: vi.fn().mockRejectedValue(new Error("db down")),
    });
    expect(await run({ kind: "ViewContent", listingId: 5 }, value)).toEqual([]);
  });
});
