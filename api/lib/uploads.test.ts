import { describe, expect, it, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import { saveDataUrl } from "./uploads";
import sharp from "sharp";

// С7/security-audit-11-09.md: GIF-загрузки раньше писались на диск байт в
// байт, без проверки, что это действительно GIF. saveDataUrl теперь
// прогоняет их через sharp — не-GIF (или GIF с приклеенным хвостом) либо
// отклоняется, либо хвост отваливается при перекодировании.

// Валидный 1x1 прозрачный GIF89a (общеизвестные минимальные байты).
const VALID_GIF_B64 = "R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

const savedFiles: string[] = [];

afterEach(() => {
  for (const url of savedFiles.splice(0)) {
    const name = url.replace("/api/uploads/", "");
    for (const dir of ["uploads", path.join("uploads", "thumbs")]) {
      const file = path.resolve(process.cwd(), dir, name);
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
  }
});

describe("saveDataUrl: smartphone image orientation and bounds", () => {
  it("rotates EXIF orientation in both the full image and card thumbnail", async () => {
    const input = await sharp({ create: { width: 120, height: 60, channels: 3, background: "#fff" } }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const url = await saveDataUrl(`data:image/jpeg;base64,${input.toString("base64")}`);
    savedFiles.push(url);
    const name = url.replace("/api/uploads/", "");
    for (const dir of ["uploads", path.join("uploads", "thumbs")]) {
      const metadata = await sharp(fs.readFileSync(path.resolve(process.cwd(), dir, name))).metadata();
      expect(metadata.width).toBe(60); expect(metadata.height).toBe(120);
    }
  });

  it("keeps tall photos within 1920px on both axes", async () => {
    const input = await sharp({ create: { width: 100, height: 4000, channels: 3, background: "#fff" } }).png().toBuffer();
    const url = await saveDataUrl(`data:image/png;base64,${input.toString("base64")}`);
    savedFiles.push(url);
    const metadata = await sharp(fs.readFileSync(path.resolve(process.cwd(), "uploads", url.replace("/api/uploads/", "")))).metadata();
    expect(metadata.width).toBeLessThanOrEqual(1920); expect(metadata.height).toBeLessThanOrEqual(1920);
  });
});

describe("saveDataUrl: GIF идёт через реэнкод sharp", () => {
  it("настоящий GIF сохраняется и остаётся валидным GIF", async () => {
    const url = await saveDataUrl(`data:image/gif;base64,${VALID_GIF_B64}`);
    savedFiles.push(url);
    expect(url).toMatch(/^\/api\/uploads\/[\w-]+\.gif$/);
    const file = path.resolve(process.cwd(), "uploads", url.replace("/api/uploads/", ""));
    const bytes = fs.readFileSync(file);
    expect(bytes.subarray(0, 6).toString("ascii")).toMatch(/^GIF8[79]a$/);
  });

  it("polyglot (валидный GIF + приклеенный посторонний хвост) теряет хвост при перекодировании", async () => {
    const validGif = Buffer.from(VALID_GIF_B64, "base64");
    const polyglot = Buffer.concat([validGif, Buffer.from("\n<script>alert(1)</script>")]);
    const url = await saveDataUrl(`data:image/gif;base64,${polyglot.toString("base64")}`);
    savedFiles.push(url);
    const file = path.resolve(process.cwd(), "uploads", url.replace("/api/uploads/", ""));
    const bytes = fs.readFileSync(file);
    expect(bytes.includes("<script>")).toBe(false);
  });

  it("мусор под видом GIF отклоняется", async () => {
    const garbage = Buffer.from("not a real gif at all, just text pretending");
    await expect(
      saveDataUrl(`data:image/gif;base64,${garbage.toString("base64")}`),
    ).rejects.toThrow();
  });
});
