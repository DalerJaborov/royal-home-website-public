import sharp from 'sharp';
import { readdirSync, statSync, mkdirSync, renameSync, copyFileSync, unlinkSync } from 'fs';
import path from 'path';

function moveFile(src, dest) {
  try {
    renameSync(src, dest);
    return;
  } catch {
    // fall through to copy+unlink
  }
  try {
    copyFileSync(src, dest);
    unlinkSync(src);
  } catch (err) {
    console.warn(`WARN: could not remove original ${src} (${err.code}) — leaving it in place`);
  }
}

const ROOT = path.resolve(import.meta.dirname, '..', 'public', 'images');
const BACKUP_ROOT = path.resolve(import.meta.dirname, '..', '_original_images_backup');
const SKIP_EXT = new Set(['.svg', '.gif', '.webp']);
const MAX_DIM = 1920;
const QUALITY = 80;

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, files);
    else files.push(full);
  }
  return files;
}

const files = walk(ROOT);
let totalBefore = 0;
let totalAfter = 0;
const converted = [];

for (const file of files) {
  const ext = path.extname(file).toLowerCase();
  if (SKIP_EXT.has(ext)) continue;

  const before = statSync(file).size;
  const outFile = file.slice(0, -ext.length) + '.webp';

  const img = sharp(file);
  const meta = await img.metadata();
  let pipeline = img;
  if (meta.width && meta.width > MAX_DIM) {
    pipeline = pipeline.resize({ width: MAX_DIM, withoutEnlargement: true });
  }
  await pipeline.webp({ quality: QUALITY }).toFile(outFile);

  const after = statSync(outFile).size;
  totalBefore += before;
  totalAfter += after;
  converted.push({ file: path.relative(ROOT, file), before, after });

  const backupPath = path.join(BACKUP_ROOT, path.relative(ROOT, file));
  mkdirSync(path.dirname(backupPath), { recursive: true });
  moveFile(file, backupPath);
}

converted.sort((a, b) => b.before - a.before);
for (const c of converted) {
  console.log(`${c.file}: ${(c.before / 1024).toFixed(0)}KB -> ${(c.after / 1024).toFixed(0)}KB`);
}
console.log(`\nTotal: ${(totalBefore / 1024 / 1024).toFixed(2)}MB -> ${(totalAfter / 1024 / 1024).toFixed(2)}MB (${converted.length} files)`);
