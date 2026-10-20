/**
 * Everything that makes the Meta Pixel visible in the served HTML and CSP.
 * With an empty pixel id both functions are identity/empty: nothing is loaded,
 * the CSP is unchanged, and the browser never talks to Meta.
 */

/** Hosts fbevents.js needs: https://developers.facebook.com/docs/meta-pixel (script, /tr beacon, signals config). */
export const META_PIXEL_CSP = {
  script: ['https://connect.facebook.net'],
  img: ['https://www.facebook.com'],
  connect: ['https://www.facebook.com', 'https://connect.facebook.net'],
} as const;

/** Leading-space-prefixed source list to append to a directive, or '' when disabled. */
export function metaPixelCspSources(enabled: boolean): Record<keyof typeof META_PIXEL_CSP, string> {
  const join = (hosts: readonly string[]) => (enabled ? ` ${hosts.join(' ')}` : '');
  return { script: join(META_PIXEL_CSP.script), img: join(META_PIXEL_CSP.img), connect: join(META_PIXEL_CSP.connect) };
}

/** Adds the config <meta> and the same-origin loader to a public page. Admin routes are left untouched. */
/** `assetVersion` busts the 30-day static cache when public/meta-pixel-loader.js changes. */
export function injectMetaPixel(html: string, pixelId: string, basePath: string, assetVersion = ''): string {
  if (!/^\d{8,20}$/.test(pixelId) || basePath.startsWith('/admin')) return html;
  const tags = `    <meta name="meta-pixel-id" content="${pixelId}">\n    <script src="/meta-pixel-loader.js${/^[a-f0-9]{8,64}$/.test(assetVersion) ? `?v=${assetVersion}` : ''}" defer></script>\n`;
  return html.includes('</head>') ? html.replace('</head>', () => `${tags}  </head>`) : html;
}
