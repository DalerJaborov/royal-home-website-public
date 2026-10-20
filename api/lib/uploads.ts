import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import sharp from "sharp";

const UPLOADS_DIR = path.resolve(process.cwd(), "uploads");

// Animated GIFs retain animation through re-encoding; other images become WebP.
const KNOWN_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8 MB decoded
const MAX_DIMENSION = 1920;
const WEBP_QUALITY = 80;
// Mirrors the CRM's own upload pipeline (D:\CRM apps/api/src/routes/properties.ts)
// so src/lib/images.ts's toThumbUrl() — which blindly rewrites any
// /uploads/<name> to /uploads/thumbs/<name> for card grids — has something
// real to find. Photos uploaded here previously only ever got the full-size
// file, so card thumbnails 404'd (broken/gray) even though the full photo
// displayed fine on the listing detail page.
const THUMB_DIR = path.join(UPLOADS_DIR, "thumbs");
// 800px, не 400: карточки каталога на ретина-экранах (DPR 2-3) при ширине
// ~300-400px требуют вдвое больше пикселей, иначе миниатюра мылит. Совпадает
// с шириной миниатюр в CRM (properties.ts).
const THUMB_WIDTH = 800;

export async function saveDataUrl(dataUrl: string): Promise<string> {
  const match = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/.exec(dataUrl);
  if (!match) {
    throw new Error("Ожидается изображение в формате data URL");
  }
  const [, mime, base64] = match;
  // Strict whitelist: anything that isn't a known image type is rejected
  // instead of being written to disk with a guessed extension.
  if (!KNOWN_MIME.has(mime)) {
    throw new Error("Допустимы только изображения JPEG, PNG, WebP или GIF");
  }

  const buffer = Buffer.from(base64, "base64");
  if (buffer.byteLength > MAX_UPLOAD_BYTES) {
    throw new Error("Файл слишком большой (максимум 8 МБ)");
  }

  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  fs.mkdirSync(THUMB_DIR, { recursive: true });

  if (mime === "image/gif") {
    // С7/security-audit-11-09.md: раньше байты писались на диск как есть —
    // любой polyglot-файл (валидный GIF заголовок + произвольный хвост,
    // например встроенный HTML/JS) уходил на диск нетронутым, смягчал это
    // только правильный Content-Type при отдаче. sharp({animated:true})
    // декодирует файл по-честному (все кадры) и перекодирует заново — если
    // это не настоящий GIF, декодирование упадёт и загрузка отклонится;
    // хвост, который не является кадрами GIF, декодер просто не увидит.
    let reencoded: Buffer;
    try {
      reencoded = await sharp(buffer, { animated: true }).gif().toBuffer();
    } catch {
      throw new Error("Файл повреждён или не является настоящим GIF");
    }
    const filename = `${randomUUID()}.gif`;
    fs.writeFileSync(path.join(UPLOADS_DIR, filename), reencoded);
    // toThumbUrl() rewrites the extension-preserving path /uploads/<name> ->
    // /uploads/thumbs/<name>, so the thumb file must keep the same .gif name
    // (and therefore be real GIF bytes, not webp under a renamed extension —
    // that would serve with the wrong Content-Type). Full-size copy, not
    // resized — GIF uploads are a rare edge case, correctness matters more
    // than shaving its (already small, animated) file size here.
    fs.writeFileSync(path.join(THUMB_DIR, filename), reencoded);
    return `/api/uploads/${filename}`;
  }

  // Apply EXIF orientation BEFORE metadata is stripped by WebP encoding.
  // Fit both axes: a portrait narrower than 1920px may still be 8000px tall.
  const optimized = await sharp(buffer)
    .rotate()
    .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: "inside", withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY }).toBuffer();

  const filename = `${randomUUID()}.webp`;
  fs.writeFileSync(path.join(UPLOADS_DIR, filename), optimized);

  const thumb = await sharp(buffer).rotate().resize({ width: THUMB_WIDTH, withoutEnlargement: true }).webp({ quality: WEBP_QUALITY }).toBuffer();
  fs.writeFileSync(path.join(THUMB_DIR, filename), thumb);

  return `/api/uploads/${filename}`;
}
