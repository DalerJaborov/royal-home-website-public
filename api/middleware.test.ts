import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ isProduction: true, unavailable: false }));
vi.mock("./lib/env", () => ({ env: state }));
vi.mock("./queries/connection", () => ({
  looksLikeConnectionFailure: (error: Error) => /ECONNREFUSED/.test(error.message),
  markDbUnavailable: vi.fn(() => { state.unavailable = true; }),
}));

import { createRouter, publicQuery } from "./middleware";
import { markDbUnavailable } from "./queries/connection";

beforeEach(() => { state.isProduction = true; state.unavailable = false; vi.clearAllMocks(); });

describe("database failure handling", () => {
  it("production never replaces real listings with demo memory or retries writes", async () => {
    const write = vi.fn(() => { if (!state.unavailable) throw new Error("ECONNREFUSED"); return "saved to volatile memory"; });
    const router = createRouter({ save: publicQuery.mutation(write) });
    await expect(router.createCaller({ req: new Request("http://localhost"), resHeaders: new Headers() }).save()).rejects.toThrow();
    expect(write).toHaveBeenCalledTimes(1);
    expect(markDbUnavailable).not.toHaveBeenCalled();
  });

  it("development does not replay a mutation after a partial database failure", async () => {
    state.isProduction = false;
    const write = vi.fn(() => { if (!state.unavailable) throw new Error("ECONNREFUSED"); return "duplicate side effect"; });
    const router = createRouter({ save: publicQuery.mutation(write) });
    await expect(router.createCaller({ req: new Request("http://localhost"), resHeaders: new Headers() }).save()).rejects.toThrow();
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("development can retry read queries using its deliberate demo fallback", async () => {
    state.isProduction = false;
    const read = vi.fn(() => { if (!state.unavailable) throw new Error("ECONNREFUSED"); return ["demo listing"]; });
    const router = createRouter({ list: publicQuery.query(read) });
    await expect(router.createCaller({ req: new Request("http://localhost"), resHeaders: new Headers() }).list()).resolves.toEqual(["demo listing"]);
    expect(read).toHaveBeenCalledTimes(2);
  });
});
