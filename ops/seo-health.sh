#!/usr/bin/env bash
# Daily read-only crawl through the public domain, using the app's existing Node runtime.
# No secrets, database writes, submissions, or new images are needed.
set -euo pipefail
cd /opt/royalhome-site
exec 9>/run/lock/royalhome-seo-health.lock
flock -n 9 || exit 0
stamp=$(date -u +%Y%m%dT%H%M%SZ)
report_path="/app/data/seo/report-${stamp}.json"
{
  cat <<'JS'
import * as seoFs from 'node:fs';
const seoDirectory = '/app/data/seo';
seoFs.mkdirSync(seoDirectory, { recursive: true });
for (const name of seoFs.readdirSync(seoDirectory)) {
  if (/^report-\d{8}T\d{6}Z\.json$/.test(name)) {
    const file = `${seoDirectory}/${name}`;
    if (Date.now() - seoFs.statSync(file).mtimeMs > 14 * 24 * 3600_000) seoFs.unlinkSync(file);
  }
}
process.on('exit', code => {
  if (seoFs.existsSync(process.env.SEO_CHECK_REPORT)) {
    seoFs.copyFileSync(process.env.SEO_CHECK_REPORT, `${seoDirectory}/latest.json`);
    if (code === 0) seoFs.copyFileSync(process.env.SEO_CHECK_REPORT, `${seoDirectory}/last-success.json`);
  }
});
JS
  cat scripts/lib/seo-validation.mjs
  sed "/^import { structuredDataFacts } from '.\/lib\/seo-validation.mjs';$/d" scripts/check-public-seo.mjs
} | docker exec --interactive --env "SEO_CHECK_REPORT=$report_path" --env SEO_CHECK_ORIGIN=https://royalhome.tj royalhome-site-app-1 node --input-type=module
