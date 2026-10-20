// Generates down-scaled webp variants of the four CMS hero-background photos so
// the hero can serve a right-sized image per viewport (srcset) instead of one
// desktop-width file on phones. Idempotent — safe to re-run. See src/pages/Home
// (hero <img>) and api/lib/vite.ts (matching preload).
import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pub = path.join(root, 'public');

// width descriptors to emit per source (only those strictly smaller than the
// original are written — no upscaling).
const SOURCES = [
  '/images/banners/hero-new.webp',
  '/images/banners/dushanbe-cta.webp',
  '/images/apartments/apt1.webp',
  '/images/apartments/apt2.webp',
];
const WIDTHS = [768, 1280];

for (const rel of SOURCES) {
  const src = path.join(pub, rel);
  const meta = await sharp(src).metadata();
  for (const w of WIDTHS) {
    if (w >= meta.width) continue; // never enlarge
    const out = src.replace(/\.webp$/, `-${w}.webp`);
    await sharp(src)
      .resize({ width: w })
      .webp({ quality: 72 })
      .toFile(out);
    console.log('✓', path.relative(root, out), `${w}w`);
  }
}
console.log('done');
