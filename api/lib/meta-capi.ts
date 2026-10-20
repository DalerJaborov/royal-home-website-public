import { createHash } from "node:crypto";
import { env } from "./env";
import { clientIp } from "./rate-limit";

/**
 * Meta Conversions API transport. Pure builders + one fire-and-forget sender.
 *
 * Docs:
 *  - https://developers.facebook.com/docs/marketing-api/conversions-api/using-the-api
 *  - https://developers.facebook.com/docs/marketing-api/conversions-api/parameters
 * Graph API versions: https://developers.facebook.com/docs/graph-api/changelog/
 * (v26.0 is the latest at the time of writing; v25.0 stays available until 2028-07.)
 */
export const META_GRAPH_VERSION = "v26.0";
export const META_GRAPH_ORIGIN = "https://graph.facebook.com";
const SEND_TIMEOUT_MS = 5000;
/** One failure line per window: a Meta outage must not flood the log once per page view. */
const ERROR_LOG_INTERVAL_MS = 10 * 60 * 1000;

export interface MetaConfig {
  pixelId: string;
  token: string;
  testEventCode: string;
}

/** Browser pixel is on iff pixelId is set; server events additionally need the token. */
export function metaConfig(): MetaConfig {
  return {
    pixelId: env.metaPixelId,
    token: env.metaCapiToken,
    testEventCode: env.metaCapiTestEventCode,
  };
}

export const isPixelEnabled = (config: MetaConfig) => config.pixelId !== "";
export const isCapiEnabled = (config: MetaConfig) =>
  config.pixelId !== "" && config.token !== "";

export interface MetaRequestContext {
  ip?: string;
  userAgent?: string;
  /** _fbp / _fbc first-party cookies written by the Pixel (or by meta-pixel-loader.js from fbclid). */
  fbp?: string;
  fbc?: string;
  sourceUrl?: string;
  /** Anonymous site visitor id (rh_visitor_id); hashed before it leaves the server. */
  visitorId?: string;
}

export interface CapiEvent {
  event_name: string;
  event_time: number;
  event_id: string;
  action_source: "website";
  event_source_url?: string;
  user_data: Record<string, string | string[]>;
  custom_data?: Record<string, unknown>;
}

const FBP = /^fb\.\d\.\d{10,16}\.\d{1,20}$/;
const FBC = /^fb\.\d\.\d{10,16}\.[A-Za-z0-9_-]{1,512}$/;

/** SHA-256 of the trimmed, lower-cased value, hex — Meta's normalization for hashed identifiers. */
export function sha256Hex(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

export function readCookie(
  header: string | null | undefined,
  name: string
): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index > 0 && part.slice(0, index).trim() === name)
      return part.slice(index + 1).trim();
  }
  return undefined;
}

function sourceUrl(referer: string | null): string | undefined {
  if (!referer || referer.length > 2000) return undefined;
  try {
    const url = new URL(referer);
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    url.hash = "";
    return url.toString();
  } catch {
    return undefined;
  }
}

/** Client IP / UA / cookies / page URL of the HTTP request that carried the event. */
export function readMetaRequestContext(
  req: Request,
  visitorId?: string
): MetaRequestContext {
  const cookies = req.headers.get("cookie");
  const ip = clientIp(req);
  const fbp = readCookie(cookies, "_fbp");
  const fbc = readCookie(cookies, "_fbc");
  return {
    ip: ip === "unknown" ? undefined : ip,
    userAgent: req.headers.get("user-agent")?.slice(0, 500) || undefined,
    fbp: fbp && FBP.test(fbp) ? fbp : undefined,
    fbc: fbc && FBC.test(fbc) ? fbc : undefined,
    sourceUrl: sourceUrl(req.headers.get("referer")),
    visitorId,
  };
}

export function buildCapiEvent(input: {
  name: string;
  eventId: string;
  context: MetaRequestContext;
  customData?: Record<string, unknown>;
  /** Unix seconds; defaults to now. */
  time?: number;
}): CapiEvent {
  const { context } = input;
  const userData: CapiEvent["user_data"] = {};
  if (context.ip) userData.client_ip_address = context.ip;
  if (context.userAgent) userData.client_user_agent = context.userAgent;
  if (context.fbp) userData.fbp = context.fbp;
  if (context.fbc) userData.fbc = context.fbc;
  if (context.visitorId) userData.external_id = [sha256Hex(context.visitorId)];
  return {
    event_name: input.name,
    event_time: input.time ?? Math.floor(Date.now() / 1000),
    event_id: input.eventId,
    action_source: "website",
    ...(context.sourceUrl ? { event_source_url: context.sourceUrl } : {}),
    user_data: userData,
    ...(input.customData && Object.keys(input.customData).length
      ? { custom_data: input.customData }
      : {}),
  };
}

/**
 * The token goes in the query string exactly as the Meta documentation shows;
 * the JSON body carries only events (and the optional test code), never the token.
 */
export function buildCapiRequest(
  config: MetaConfig,
  events: CapiEvent[]
): { url: string; init: RequestInit } {
  const url = `${META_GRAPH_ORIGIN}/${META_GRAPH_VERSION}/${encodeURIComponent(config.pixelId)}/events?access_token=${encodeURIComponent(config.token)}`;
  const body = {
    data: events,
    ...(config.testEventCode ? { test_event_code: config.testEventCode } : {}),
  };
  return {
    url,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      redirect: "error",
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    },
  };
}

let lastErrorLoggedAt = 0;
function logFailureOnce(reason: string, now = Date.now()): void {
  if (now - lastErrorLoggedAt < ERROR_LOG_INTERVAL_MS) return;
  lastErrorLoggedAt = now;
  // Reason is a status/error-code summary only — never the request URL (it holds the token).
  console.error(`[meta-capi] событие не доставлено: ${reason}`);
}
/** Test hook: lets each test observe the throttled log from a clean state. */
export function resetMetaCapiLogThrottle(): void {
  lastErrorLoggedAt = 0;
}

/**
 * Sends events to Meta. Never throws and never rejects: the visitor's request
 * must not depend on Meta. A no-op when the pixel id or token is missing.
 */
export async function sendCapiEvents(
  config: MetaConfig,
  events: CapiEvent[],
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  if (!isCapiEnabled(config) || events.length === 0) return;
  try {
    const { url, init } = buildCapiRequest(config, events);
    const response = await fetchImpl(url, init);
    if (!response.ok) {
      let detail = "";
      try {
        const payload = (await response.json()) as {
          error?: { type?: string; code?: number; message?: string };
        };
        detail = [
          payload.error?.type,
          payload.error?.code,
          payload.error?.message,
        ]
          .filter(Boolean)
          .join(" ");
      } catch {
        /* Non-JSON error body: the status alone is enough. */
      }
      logFailureOnce(
        `HTTP ${response.status}${detail ? ` ${detail.replaceAll(config.token, "***")}` : ""}`
      );
    }
  } catch (error) {
    // fetch errors carry no URL in Node, but be defensive: scrub the token anyway.
    const message = error instanceof Error ? error.name : "unknown";
    logFailureOnce(message);
  }
}
