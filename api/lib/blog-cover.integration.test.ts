/**
 * Живая проверка обложки: настоящий вызов Gemini через прокси, настоящий файл на диске.
 *
 * По умолчанию пропускается — это стоит денег и требует сети. Запуск вручную:
 *   GEMINI_COVER_SMOKE=1 GEMINI_PROXY_URL=… GEMINI_PROXY_KEY=… GEMINI_API_KEY=… \
 *   npx vitest run api/lib/blog-cover.integration.test.ts
 *
 * Смысл: юнит-тесты проверяют промт, а этот — то, что разбор ответа, размер
 * картинки и запись в uploads действительно сходятся. Ровно тут и ломается,
 * когда Google меняет форму ответа.
 */
import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { generateCoverImage } from "./blog-cover";

const enabled = process.env.GEMINI_COVER_SMOKE === "1" && Boolean(process.env.GEMINI_API_KEY);

describe.skipIf(!enabled)("живая генерация обложки", () => {
  it("рисует картинку и кладёт её в uploads", async () => {
    const url = await generateCoverImage(process.env.GEMINI_API_KEY!, {
      title: "Сколько стоит однокомнатная квартира в районе Сино",
      excerpt: "Разбор цен по данным каталога royalhome.tj",
    });

    expect(url).toMatch(/^\/api\/uploads\/[\w-]+\.(webp|jpe?g|png)$/);

    const file = path.resolve(process.cwd(), "uploads", url.replace("/api/uploads/", ""));
    const stat = fs.statSync(file);
    expect(stat.size).toBeGreaterThan(20_000);

    // Миниатюра нужна карточкам блога: toThumbUrl() слепо переписывает путь.
    const thumb = path.resolve(process.cwd(), "uploads", "thumbs", url.replace("/api/uploads/", ""));
    expect(fs.existsSync(thumb)).toBe(true);
  }, 180_000);
});
