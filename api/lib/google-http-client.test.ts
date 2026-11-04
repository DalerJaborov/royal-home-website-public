import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { google } from "googleapis";

// Real SDK/transport, synthetic local HTTP server: no credentials, Google calls
// or production writes. Covers the narrowly overridden gaxios dependency.
let server: Server;
let rootUrl: string;
let received: { method?: string; url?: string; body: string };
beforeAll(async () => {
  server = createServer(async (req, res) => {
    if (req.url?.includes("slow-sheet")) return; // the client must time out
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    received = { method: req.method, url: req.url, body: Buffer.concat(chunks).toString() };
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ spreadsheetId: "synthetic-sheet", updates: { updatedRows: 1 } }));
  }).listen(0, "127.0.0.1");
  await once(server, "listening");
  rootUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}/`;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

describe("Google Sheets SDK with patched HTTP transport", () => {
  it("preserves append request and response semantics", async () => {
    const sheets = google.sheets({ version: "v4", auth: "synthetic-test-key" });
    const result = await sheets.spreadsheets.values.append({
      spreadsheetId: "synthetic-sheet", range: "Sheet1!A1", valueInputOption: "RAW",
      requestBody: { values: [["synthetic", "row"]] },
    }, { rootUrl, timeout: 2000, retry: false });
    expect(result.data.updates?.updatedRows).toBe(1);
    expect(received.method).toBe("POST");
    expect(received.url).toContain("/v4/spreadsheets/synthetic-sheet/values/");
    expect(JSON.parse(received.body)).toEqual({ values: [["synthetic", "row"]] });
  });
  it("still aborts requests which exceed the configured timeout", async () => {
    const sheets = google.sheets({ version: "v4", auth: "synthetic-test-key" });
    const start = Date.now();
    await expect(sheets.spreadsheets.values.get({ spreadsheetId: "slow-sheet", range: "Sheet1!A1" },
      { rootUrl, timeout: 50, retry: false })).rejects.toThrow();
    expect(Date.now() - start).toBeLessThan(2000);
  });
});
