import { TRPCError } from "@trpc/server";

/**
 * Small in-memory rate limiter (per-IP, per-bucket sliding window).
 * Good enough for a single-server deployment: stops brute-forcing the admin
 * password and spamming the lead forms without any extra infrastructure.
 */
const hits = new Map<string, number[]>();

// Drop stale entries occasionally so the map doesn't grow forever.
let lastSweep = Date.now();
function sweep(now: number) {
  if (now - lastSweep < 10 * 60 * 1000) return;
  lastSweep = now;
  for (const [key, times] of hits) {
    const alive = times.filter((t) => now - t < 60 * 60 * 1000);
    if (alive.length === 0) hits.delete(key);
    else hits.set(key, alive);
  }
}

export function clientIp(req: Request): string {
  // The app is only reachable through a single trusted reverse proxy (Caddy),
  // which APPENDS the real client IP to X-Forwarded-For. So the LAST entry is
  // the one Caddy added and cannot be spoofed by the client — the client can
  // only prepend fake entries ahead of it. Reading the FIRST entry (as before)
  // let an attacker send `X-Forwarded-For: <random>` on each request to rotate
  // their apparent IP and slip past the per-IP login/lead rate limits.
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const parts = fwd.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return req.headers.get("x-real-ip") || "unknown";
}

export function assertRateLimit(
  req: Request,
  bucket: string,
  max: number,
  windowMs: number,
  message = "Слишком много запросов. Попробуйте позже.",
) {
  const now = Date.now();
  sweep(now);
  const key = `${bucket}:${clientIp(req)}`;
  const times = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (times.length >= max) {
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message });
  }
  times.push(now);
  hits.set(key, times);
}
