import { resolvePublicPath } from '@contracts/public-i18n';

type Manifest = Record<string, { file: string; imports?: string[]; css?: string[] }>;

/** Discover the home/catalogue lazy JS during HTML parsing, rather than after
 * downloading/executing the app, rendering React and resolving React.lazy. */
export function catalogModulePreloads(path: string, manifest: Manifest, html: string) {
  const basePath = resolvePublicPath(new URL(path, 'https://royalhome.tj').pathname).basePath;
  const entry = basePath === '/' ? 'src/pages/Home.tsx'
    : basePath === '/listings' ? 'src/pages/ListingsPage.tsx' : undefined;
  if (!entry) return '';
  const seen = new Set<string>();
  const files = new Set<string>();
  const styles = new Set<string>();
  function visit(key: string, includeScripts = true) {
    const identity = `${includeScripts ? 'js' : 'css'}:${key}`;
    if (seen.has(identity)) return;
    seen.add(identity);
    const chunk = manifest[key];
    if (!chunk) return;
    for (const dependency of chunk.imports ?? []) visit(dependency, includeScripts);
    for (const css of chunk.css ?? []) {
      if (/^assets\/[a-zA-Z0-9_.-]+\.css$/.test(css) && !html.includes(`"/${css}"`)) styles.add(css);
    }
    if (includeScripts && /^assets\/[a-zA-Z0-9_.-]+\.js$/.test(chunk.file) && !html.includes(`"/${chunk.file}"`)) files.add(chunk.file);
  }
  const hydrated = html.includes('data-public-ssr="true"');
  visit(entry, !hydrated);
  // These lazy components are already present in the completed server tree.
  // Supply their layout before the first paint: otherwise native lazy images
  // are evaluated in unstyled containers and compete with the hero.
  if (basePath === '/' && hydrated) visit('src/components/HomeServices.tsx', false);
  // Avoid competing with blocking CSS, fonts and the first cover on slow links.
  // Vite waits for a lazy route's CSS before resolving the module. Discover it
  // with the HTML, rather than adding a second stylesheet round trip after JS.
  return [...styles].map(file => `<link rel="stylesheet" href="/${file}">`).concat(
    [...files].map(file => `<link rel="modulepreload" crossorigin fetchpriority="low" href="/${file}">`)
  ).join('\n');
}
