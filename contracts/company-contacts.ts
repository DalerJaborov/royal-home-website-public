/** Separate call and WhatsApp destinations confirmed by the owner on 2026-10-17. */
export const COMPANY_CONTACTS = {
  callNumber: '+992446501414',
  callDisplay: '+992 44 650 14 14',
  callHref: 'tel:+992446501414',
  whatsappNumber: '+992777776001',
  whatsappDisplay: '+992 777 77 60 01',
  whatsappHref: 'https://wa.me/992777776001',
} as const;

/** Office reception hours confirmed by the agency owner. Sunday is closed. */
export const COMPANY_HOURS = {
  display: 'Пн–Сб: 09:30–18:00',
  opens: '09:30',
  closes: '18:00',
} as const;

/** Exact TikTok account corrected by the owner on 2026-10-16. */
export const COMPANY_SOCIALS = {
  tiktok: 'https://www.tiktok.com/@royal.home.tjk',
} as const;

const approvedNumberSources = [COMPANY_CONTACTS.callNumber, COMPANY_CONTACTS.whatsappNumber]
  .map((number) => number.slice(1).split('').join('[\\s().-]*'));
// Match legacy CMS content without shipping the retired number as a contact
// literal in the public JavaScript bundle.
const retiredNumberSource = '9[\\s().-]*9[\\s().-]*2[\\s().-]*9[\\s().-]*1[\\s().-]*8[\\s().-]*6[\\s().-]*4[\\s().-]*1[\\s().-]*7[\\s().-]*1[\\s().-]*8';
const numberSource = `(?<!\\d)\\+?(?:${[...approvedNumberSources, retiredNumberSource].join('|')})(?!\\d)`;

/** Cleans legacy company contacts in public CMS/SEO/article text, without touching
 * unrelated visitor/realtor phone numbers. This is contact normalization, not HTML sanitization. */
export function normalizeCompanyContactText(value: string): string {
  const protectedValues: string[] = [];
  const whatsappAnchors = new Set<number>();
  const knownNumber = new RegExp(`^${numberSource}$`);
  const whatsappUrl = (url: string) => {
    const text = new URL(url.replace(/&amp;/g, '&')).searchParams.get('text');
    return COMPANY_CONTACTS.whatsappHref + (text ? `?text=${encodeURIComponent(text)}` : '');
  };
  const protect = (replacement: string, wasWhatsapp = false) => {
    if (wasWhatsapp) whatsappAnchors.add(protectedValues.length);
    protectedValues.push(replacement);
    return `__ROYAL_CONTACT_${protectedValues.length - 1}__`;
  };
  let result = value.replace(/https?:\/\/wa\.me\/(\d+)(?:\?[^\s"'<>]*)?/gi,
    (url, number: string) => knownNumber.test(number) ? protect(whatsappUrl(url), true) : url);
  result = result.replace(/https?:\/\/(?:api\.)?whatsapp\.com\/send\?[^\s"'<>]+/gi, (url) => {
    try { return knownNumber.test(new URL(url.replace(/&amp;/g, '&')).searchParams.get('phone') ?? '')
      ? protect(whatsappUrl(url), true) : url; }
    catch { return url; }
  });
  result = result.replace(new RegExp(`tel:\\s*${numberSource}`, 'gi'), () => protect(COMPANY_CONTACTS.callHref));
  // Preserve messenger labels and protect their displayed number from call normalization.
  result = result.replace(/(<a\b[^>]*href=["']__ROYAL_CONTACT_\d+__[^"']*["'][^>]*>)([\s\S]*?)(<\/a>)/gi,
    (match, start: string, label: string, end: string) => {
      const token = /__ROYAL_CONTACT_(\d+)__/.exec(start);
      if (!token || !whatsappAnchors.has(Number(token[1]))) return match;
      return `${start}${protect(label.replace(new RegExp(numberSource, 'g'), COMPANY_CONTACTS.whatsappDisplay))}${end}`;
    });
  result = result.replace(new RegExp(`((?:WhatsApp|Ватсап|Ватсапп)\\s*[:—-]?\\s*)${numberSource}`, 'gi'),
    (_match, label: string) => protect(label + COMPANY_CONTACTS.whatsappDisplay));
  result = result.replace(new RegExp(numberSource, 'g'), COMPANY_CONTACTS.callDisplay);
  return result.replace(/__ROYAL_CONTACT_(\d+)__/g, (token, index: string) => protectedValues[Number(index)] ?? token);
}

export function normalizeCompanyPublicValue<T>(value: T): T {
  if (value instanceof Date) return value;
  if (typeof value === 'string') return normalizeCompanyContactText(value) as T;
  if (Array.isArray(value)) return value.map((item: unknown) => normalizeCompanyPublicValue(item)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeCompanyPublicValue(item)])) as T;
  }
  return value;
}

export function normalizeCompanySiteSettings<T extends { phone?: string; whatsapp?: string; tiktok?: string; workHours?: string; socialVisibility?: { whatsapp?: boolean } }>(site: T): T {
  // Preserve translated weekday labels while correcting the known stale opening time.
  const workHours = site.workHours?.replace(/09:00/g, COMPANY_HOURS.opens) || COMPANY_HOURS.display;
  return { ...normalizeCompanyPublicValue(site), phone: COMPANY_CONTACTS.callDisplay, whatsapp: COMPANY_CONTACTS.whatsappNumber, tiktok: COMPANY_SOCIALS.tiktok,
    socialVisibility: { ...site.socialVisibility, whatsapp: true }, workHours };
}

/** Only public CMS content is normalized; secret/API-key settings stay byte-for-byte intact. */
export function normalizePublicCmsEntry(key: string, value: unknown): unknown {
  const publicKeys = ['hero', 'banners', 'dushanbeBanner', 'services', 'blogPosts', 'reels', 'site', 'banks'];
  if (!publicKeys.includes(key)) return value;
  if (key === 'site' && value && typeof value === 'object' && !Array.isArray(value)) {
    return normalizeCompanySiteSettings(value as { phone?: string; whatsapp?: string });
  }
  return normalizeCompanyPublicValue(value);
}
