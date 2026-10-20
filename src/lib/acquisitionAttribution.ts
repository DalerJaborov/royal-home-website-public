import { normalizeLeadAttribution, type LeadAttribution } from '@contracts/lead-attribution';
import { getLeadSource } from './leadAttribution';
import { safeStorage } from './safeStorage';

const KEY = 'rh_acquisition_v1'; // gitleaks:allow -- reviewed synthetic test value or non-secret identifier
const TTL = 30 * 60_000;
let memory: { at: number; attribution: LeadAttribution } | undefined;
function read(now: number) {
  const raw = safeStorage.getItem('session', KEY);
  let value: unknown = memory;
  if (raw) { try { value = JSON.parse(raw); } catch { value = undefined; } }
  if (!value || typeof value !== 'object') return;
  const saved = value as { at?: unknown; attribution?: unknown };
  if (typeof saved.at !== 'number' || !Number.isSafeInteger(saved.at) || saved.at <= 0 || now < saved.at || now - saved.at >= TTL) {
    safeStorage.removeItem('session', KEY); memory = undefined; return;
  }
  const attribution = normalizeLeadAttribution(saved.attribution);
  return attribution ? { at: saved.at, attribution } : undefined;
}
export function recordAcquisitionVisit(path: string, search: string, referrer: string, now = Date.now()): void {
  if (!Number.isSafeInteger(now) || now <= 0 || read(now)) return;
  const query = new URLSearchParams(search);
  let referrerHost: string | undefined;
  try { const url = new URL(referrer); if (['https:', 'http:'].includes(url.protocol)) referrerHost = url.hostname; } catch { /* Direct visit. */ }
  const attribution = normalizeLeadAttribution({ landingPath: path, referrerHost,
    utmSource: query.get('utm_source'), utmMedium: query.get('utm_medium'), utmCampaign: query.get('utm_campaign') });
  if (!attribution) return;
  memory = { at: now, attribution };
  safeStorage.setItem('session', KEY, JSON.stringify(memory));
}
export function getLeadSubmissionSource(base: string, now = Date.now()): { source: string; attribution?: LeadAttribution } {
  return { source: getLeadSource(base, now), attribution: Number.isSafeInteger(now) && now > 0 ? read(now)?.attribution : undefined };
}
