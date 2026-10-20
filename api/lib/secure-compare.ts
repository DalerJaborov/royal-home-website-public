import { timingSafeEqual } from "node:crypto";

/** Constant-time string comparison for secrets (API keys, tokens).
 * A plain `!==` short-circuits on the first differing character, which lets an
 * attacker recover the secret byte-by-byte from response timings. Only the
 * length check can leak — that's standard and not exploitable for random keys. */
export function secureCompare(supplied: string | undefined | null, expected: string): boolean {
  if (!supplied) return false;
  const suppliedBuf = Buffer.from(supplied, "utf8");
  const expectedBuf = Buffer.from(expected, "utf8");
  if (suppliedBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(suppliedBuf, expectedBuf);
}
