import { createHash } from 'node:crypto';

const ASSETS = ['fonts.css', 'pwa-splash.js', 'telegram-webapp-loader.js', 'metrika-loader.js'];

/** Public entry files have stable paths, so a CDN can retain an earlier
 * stylesheet or even a missing-file 404. Their content determines the URL. */
export function versionPublicAssets(html: string, readAsset: (name: string) => Buffer): string {
  for (const name of ASSETS) {
    const hash = createHash('sha256').update(readAsset(name)).digest('hex').slice(0, 12);
    const escaped = name.replace(/\./g, '\\.');
    const pattern = new RegExp(`((?:href|src)="/${escaped})(?:\\?[^"\\s]*)?(")`, 'g');
    html = html.replace(pattern, (_match, prefix: string, suffix: string) => `${prefix}?v=${hash}${suffix}`);
  }
  if (html.includes('</body>')) {
    const worker = readAsset('sw.js');
    const workerVersion = createHash('sha256').update(worker).digest('hex').slice(0, 12);
    const registrationVersion = createHash('sha256').update(readAsset('register-sw.js')).update(worker).digest('hex').slice(0, 12);
    html = html.replace(/[ \t]*<script\b[^>]*\bsrc=["']\/register-sw\.js(?:\?[^"']*)?["'][^>]*>[\s\S]*?<\/script>\r?\n?/gi, '');
    html = html.replace('</body>', `<script src="/register-sw.js?v=${registrationVersion}" data-worker-version="${workerVersion}" defer></script>\n</body>`);
  }
  return html;
}
