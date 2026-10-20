import { resolvePublicPath } from './public-i18n';

export interface LeadAttribution {
  landingPath: string;
  referrerHost?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
}
const pages = new Set(['/', '/listings', '/contacts', '/sell', '/mortgage', '/about', '/privacy', '/blog', '/services']);
function publicLanding(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 300 || !value.startsWith('/') || value.startsWith('//')) return;
  const path = resolvePublicPath(value.split(/[?#]/, 1)[0]).basePath;
  return pages.has(path) || /^\/(?:listing\/[1-9]\d{0,9}|blog\/[a-z0-9][a-z0-9-]{0,100}|services\/[a-z0-9][a-z0-9-]{0,80}|kvartiry\/rayon-[a-z-]{1,60})$/.test(path) ? path : undefined;
}
function campaignToken(value: unknown): string | undefined {
  if (typeof value !== 'string') return;
  const token = value.trim();
  // Campaign labels only: no email addresses, phone-like tokens, URLs or arbitrary query data.
  return /^[\p{L}\p{N}_.~-]{1,80}$/u.test(token) && !/(?:^|[_.~-])\d{7,}(?:$|[_.~-])/.test(token) ? token : undefined;
}
/** Optional tracking is untrusted. Drop malformed values without rejecting a real lead. */
export function normalizeLeadAttribution(value: unknown): LeadAttribution | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  const record = value as Record<string, unknown>;
  const landingPath = publicLanding(record.landingPath);
  if (!landingPath) return;
  const host = typeof record.referrerHost === 'string' ? record.referrerHost.toLowerCase() : '';
  const referrerHost = /^(?=.{1,120}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,24}$/.test(host) && host !== 'royalhome.tj' && !host.endsWith('.royalhome.tj') ? host : undefined;
  return Object.fromEntries(Object.entries({ landingPath, referrerHost,
    utmSource: campaignToken(record.utmSource), utmMedium: campaignToken(record.utmMedium), utmCampaign: campaignToken(record.utmCampaign),
  }).filter(([, item]) => item !== undefined)) as unknown as LeadAttribution;
}
