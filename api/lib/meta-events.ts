import {
  META_CONTENT_TYPE,
  META_GEO,
  META_SEARCH_MAX_IDS,
  type MetaClientEvent,
} from "@contracts/meta-events";
import { findPublishedMetaContentIds } from "../queries/listings";
import {
  buildCapiEvent,
  isPixelEnabled,
  metaConfig,
  readMetaRequestContext,
  sendCapiEvents,
  type CapiEvent,
  type MetaConfig,
} from "./meta-capi";

/** What happened on the site, in the vocabulary of the catalog events. */
export type MetaAction =
  | { kind: "PageView" }
  | { kind: "ViewContent"; listingId: number }
  | {
      kind: "Search";
      listingIds: number[];
      searchString?: string;
      district?: string;
    }
  /** Listing saved to favorites. */
  | { kind: "InitiateCheckout"; listingId: number }
  /** Phone / WhatsApp / Telegram click on a listing: Purchase (the catalog's "contacted an agent") + Contact. */
  | { kind: "Contact"; listingId: number }
  /** Lead form submitted; with a listing it is also a Purchase for that listing. */
  | { kind: "Lead"; listingId?: number };

export interface MetaEventDeps {
  config: MetaConfig;
  resolveContentIds: (ids: number[]) => Promise<Map<number, string>>;
  send: (events: CapiEvent[]) => Promise<void>;
}

const defaultDeps = (): MetaEventDeps => {
  const config = metaConfig();
  return {
    config,
    resolveContentIds: findPublishedMetaContentIds,
    send: events => sendCapiEvents(config, events),
  };
};

/**
 * Purchase = "someone contacted an agent about a listing" in Meta's real-estate
 * spec (https://developers.facebook.com/documentation/ads-commerce/marketing-api/real-estate-ads/audience).
 * That page lists `currency` (ISO 4217) as recommended and has no `value`
 * parameter at all, while the generic Purchase standard event is rejected by
 * Events Manager without value+currency. Contacting an agent is not a sale and
 * the listing price must not be reported as revenue, so we send value 0 with
 * currency USD to satisfy the generic validation without inventing revenue.
 */
const PURCHASE_VALUE = 0;
const PURCHASE_CURRENCY = "USD";

function listingParams(contentIds: string[]): MetaClientEvent["params"] {
  return { content_type: META_CONTENT_TYPE, content_ids: contentIds };
}

async function buildEvents(
  action: MetaAction,
  deps: MetaEventDeps
): Promise<MetaClientEvent[]> {
  if (action.kind === "PageView") return [{ name: "PageView", params: {} }];
  if (action.kind === "Lead" && action.listingId === undefined)
    return [{ name: "Lead", params: {} }];

  const ids =
    action.kind === "Search"
      ? action.listingIds.slice(0, META_SEARCH_MAX_IDS)
      : [action.listingId as number];
  const resolved = await deps.resolveContentIds(ids);
  // Keep the visitor's order; ids without a catalog id (unknown / unpublished) are dropped.
  const contentIds = ids.flatMap(id => resolved.get(id) ?? []);

  switch (action.kind) {
    case "Search": {
      // No ids → nothing to match against the catalog; Meta requires content_ids for Search.
      if (contentIds.length === 0) return [];
      return [
        {
          name: "Search",
          params: {
            ...listingParams(contentIds),
            ...META_GEO,
            ...(action.searchString
              ? { search_string: action.searchString }
              : {}),
            ...(action.district ? { neighborhood: action.district } : {}),
          },
        },
      ];
    }
    case "ViewContent":
      return contentIds.length
        ? [
            {
              name: "ViewContent",
              params: { ...listingParams(contentIds), ...META_GEO },
            },
          ]
        : [];
    case "InitiateCheckout":
      return contentIds.length
        ? [{ name: "InitiateCheckout", params: listingParams(contentIds) }]
        : [];
    case "Contact": {
      if (contentIds.length === 0) return [];
      return [
        {
          name: "Purchase",
          params: {
            ...listingParams(contentIds),
            value: PURCHASE_VALUE,
            currency: PURCHASE_CURRENCY,
          },
        },
        { name: "Contact", params: listingParams(contentIds) },
      ];
    }
    case "Lead":
      // A lead whose listing cannot be resolved is still a lead, just not a catalog Purchase.
      return contentIds.length === 0
        ? [{ name: "Lead", params: {} }]
        : [
            { name: "Lead", params: listingParams(contentIds) },
            {
              name: "Purchase",
              params: {
                ...listingParams(contentIds),
                value: PURCHASE_VALUE,
                currency: PURCHASE_CURRENCY,
              },
            },
          ];
  }
}

/**
 * Builds the events for one visitor action, sends them to the Conversions API
 * (fire-and-forget) and returns the same events so the browser can replay them
 * through fbq with the SAME eventId — Meta deduplicates on event_name + event_id.
 *
 * Never throws: a tracking failure must not fail the visitor's request.
 * Returns [] when the pixel is not configured or the visitor is an admin.
 */
export async function recordMetaEvents(
  input: {
    action: MetaAction;
    eventId: string;
    req: Request;
    visitorId?: string;
    isAdmin?: boolean;
  },
  deps: MetaEventDeps = defaultDeps()
): Promise<MetaClientEvent[]> {
  if (!isPixelEnabled(deps.config) || input.isAdmin) return [];
  try {
    const events = await buildEvents(input.action, deps);
    if (events.length === 0) return [];
    const context = readMetaRequestContext(input.req, input.visitorId);
    const capiEvents = events.map(event =>
      buildCapiEvent({
        name: event.name,
        eventId: input.eventId,
        context,
        customData: event.params,
      })
    );
    // Deliberately not awaited: sendCapiEvents never rejects and has its own timeout.
    void deps.send(capiEvents);
    return events;
  } catch {
    return [];
  }
}
