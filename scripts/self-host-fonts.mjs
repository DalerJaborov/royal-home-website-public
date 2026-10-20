import fs from "fs";
import path from "path";
import { createHash } from "node:crypto";

const CSS_URL =
  "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Unbounded:wght@400;500;600;700;800;900&display=swap";
// cyrillic-ext carries the Tajik-specific letters (ғ, қ, ӯ, ҳ, ҷ — U+0460-052F)
// used throughout the site's Tajik-language content, so it must stay in.
const KEEP_SUBSETS = new Set(["latin", "cyrillic", "cyrillic-ext"]);
const FONTS_DIR = path.resolve(import.meta.dirname, "..", "public", "fonts");

async function main() {
  const res = await fetch(CSS_URL, {
    headers: {
      // A modern-browser UA gets woff2 (smallest format) from Google Fonts.
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
    },
  });
  if (!res.ok) throw new Error(`Font stylesheet request failed: ${res.status}`);
  const css = await res.text();

  const blocks = css.split(/(?=\/\* )/g).filter((b) => b.trim());
  fs.mkdirSync(FONTS_DIR, { recursive: true });

  const entries = [];
  const downloads = new Map();
  for (const block of blocks) {
    const subsetMatch = /\/\*\s*([\w-]+)\s*\*\//.exec(block);
    const subset = subsetMatch?.[1];
    if (!subset || !KEEP_SUBSETS.has(subset)) continue;

    const family = /font-family:\s*'([^']+)'/.exec(block)[1];
    const weight = /font-weight:\s*(\d+)/.exec(block)[1];
    const urlMatch = /url\((https:[^)]+\.woff2)\)/.exec(block);
    if (!urlMatch) continue;
    const remoteUrl = urlMatch[1];

    const filename = `${family.toLowerCase()}-${weight}-${subset}.woff2`;
    if (!downloads.has(remoteUrl)) {
      const fontRes = await fetch(remoteUrl);
      if (!fontRes.ok) throw new Error(`Font request failed: ${fontRes.status}`);
      downloads.set(remoteUrl, Buffer.from(await fontRes.arrayBuffer()));
    }
    const buf = downloads.get(remoteUrl);
    const hash = createHash("sha256").update(buf).digest("hex");
    entries.push({ block, family, weight, filename, buf, hash });
  }

  // Google can repeat the same variable-font binary under several fixed weight
  // rules. One shared URL lets the browser download that binary only once.
  const canonicalFiles = new Map();
  for (const entry of entries) {
    const preferredWeight = entry.family === "Inter" ? "400" : "700";
    if (!canonicalFiles.has(entry.hash) || entry.weight === preferredWeight) {
      canonicalFiles.set(entry.hash, entry.filename);
    }
  }
  const written = new Set();
  const kept = entries.map(({ block, buf, hash }) => {
    const filename = canonicalFiles.get(hash);
    if (!written.has(filename)) {
      fs.writeFileSync(path.join(FONTS_DIR, filename), buf);
      written.add(filename);
      console.log(`${filename}: ${(buf.length / 1024).toFixed(1)}KB`);
    }
    return block.replace(/url\(https:[^)]+\.woff2\)/, `url(/fonts/${filename})`).trim();
  });
  const cssPath = path.resolve(FONTS_DIR, "..", "fonts.css");
  const existingCss = fs.existsSync(cssPath) ? fs.readFileSync(cssPath, "utf8") : "";
  const fallbackRules = [...existingCss.matchAll(/@font-face\s*\{[^}]*\}/g)]
    .map(([rule]) => rule).filter((rule) => /font-family:\s*'[^']+ Fallback'/.test(rule));
  fs.writeFileSync(cssPath, [...kept, ...fallbackRules].join("\n\n") + "\n");
  console.log(`\nWrote ${kept.length} font rules referencing ${written.size} unique files`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
