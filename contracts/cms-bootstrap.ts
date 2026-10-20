export const CMS_BOOTSTRAP_ID = 'royalhome-public-cms';
const SECTIONS = ['hero', 'banners', 'dushanbeBanner', 'services', 'blogPosts', 'site', 'reels', 'categoryVisibility', 'banks'];
const ARRAYS = new Set(['services', 'blogPosts', 'banks']);
function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
/** Only public presentation sections; never serialize private generator/API settings. */
export function serializeCmsBootstrap(entries: Record<string, unknown>, now = Date.now()): string | undefined {
  const data = Object.fromEntries(SECTIONS.filter(key => entries[key] !== undefined).map(key => [key, entries[key]]));
  const source = JSON.stringify({ version: 1, generatedAt: now, data }).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return parseCmsBootstrap(source, now) ? source : undefined;
}
export function parseCmsBootstrap(source: string, now = Date.now()): { data: Record<string, unknown>; generatedAt: number } | undefined {
  if (!source || new TextEncoder().encode(source).byteLength > 256 * 1024) return;
  try {
    const value: unknown = JSON.parse(source);
    if (!object(value) || Object.keys(value).sort().join(',') !== 'data,generatedAt,version' || value.version !== 1 ||
      typeof value.generatedAt !== 'number' || !Number.isSafeInteger(value.generatedAt) || value.generatedAt <= 0 || value.generatedAt > now + 5000 || now - value.generatedAt > 30000 || !object(value.data)) return;
    if (Object.entries(value.data).some(([key, item]) => !SECTIONS.includes(key) || (ARRAYS.has(key) ? !Array.isArray(item) : !object(item)))) return;
    return { data: value.data, generatedAt: Math.min(value.generatedAt, now) };
  } catch { return; }
}
