import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { inspectCoverBuffer } from "./blog-cover";
import { checkRefresh, refreshArticleNumbers } from "./article-refresh";

describe("Cover technical quality", () => {
  it("rejects corrupt content, tiny pictures and a blank image", async () => {
    await expect(inspectCoverBuffer(Buffer.from("not an image"))).rejects.toThrow();
    const small = await sharp({ create: { width: 512, height: 512, channels: 3, background: "red" } }).png().toBuffer();
    await expect(inspectCoverBuffer(small)).rejects.toThrow("900");
    const blank = await sharp({ create: { width: 1200, height: 800, channels: 3, background: "white" } }).png().toBuffer();
    await expect(inspectCoverBuffer(blank)).rejects.toThrow("однотонная");
  });
});
describe("Conservative article refresh", () => {
  it("does not call a provider for an existing mortgage article", async () => {
    expect(await refreshArticleNumbers("unused", { title: "Ипотека в Душанбе", contentHtml: "<p>Старая статья</p>" }, "facts")).toBeNull();
  });
  it("rejects link changes even when tag and heading counts are unchanged", () => {
    expect(checkRefresh('<h2>Цены</h2><p>800000 сомони</p><a href="/listing/1">Объект</a>', '<h2>Цены</h2><p>900000 сомони</p><a href="/listing/2">Объект</a>')).toContain("ссылки");
  });
});
