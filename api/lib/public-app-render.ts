import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { PublicRenderInput } from '@contracts/public-render-input';
import { serializeCatalogBootstrap, serializeListingBootstrap } from '@contracts/catalog-bootstrap';

let renderer: Promise<{ renderPublicApplication(input: PublicRenderInput): Promise<string> }> | undefined;
/** The separately built SSR entry shares the actual browser components. */
export async function publicAppHtml(input: PublicRenderInput): Promise<string | undefined> {
  // A large/invalid snapshot is intentionally omitted from HTML. The browser
  // then fetches normally, so retain semantic fallback instead of hydrating a
  // server tree whose initial inventory the browser cannot reproduce.
  if (!serializeCatalogBootstrap(input.inventory)) return;
  if (input.listing && !serializeListingBootstrap(input.listing)) return;
  try {
    renderer ??= import(pathToFileURL(path.resolve('dist/ssr/entry-server.js')).href);
    return await (await renderer).renderPublicApplication(input);
  } catch {
    // The existing semantic HTML remains available if optional rich rendering fails.
    console.error('[public-ssr] render_failed');
    return;
  }
}
