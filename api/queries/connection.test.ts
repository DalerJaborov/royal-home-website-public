import { describe, expect, it } from "vitest";
import { looksLikeConnectionFailure } from "./connection";

describe("database error classification", () => {
  it("SQL syntax/constraint errors do not switch the whole site to demo data", () => {
    expect(looksLikeConnectionFailure(new Error("Failed query: update listings", { cause: Object.assign(new Error("Duplicate entry"), { code: "ER_DUP_ENTRY" }) }))).toBe(false);
    expect(looksLikeConnectionFailure(new Error("Failed query: select missing_column"))).toBe(false);
  });
  it("recognizes connection errors nested inside Drizzle and tRPC wrappers", () => {
    const socketError = Object.assign(new Error("connect failed"), { code: "ECONNREFUSED" });
    expect(looksLikeConnectionFailure(new Error("Failed query", { cause: socketError }))).toBe(true);
    expect(looksLikeConnectionFailure(new Error("request failed", { cause: new Error("Failed query", { cause: socketError }) }))).toBe(true);
  });
});
