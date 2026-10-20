import type { SiteSettings } from '@/contexts/CmsContext';
import { COMPANY_CONTACTS, COMPANY_SOCIALS } from '@contracts/company-contacts';

/**
 * Единая точка правды для соцссылок сайта. Раньше Footer и ContactsPage держали
 * ссылки захардкоженными — поля «Соцсети» в админке сохранялись, но ни на что
 * не влияли. Теперь: значение из CMS (принимает полный URL, @username или голый
 * username/номер) → нормализованный URL; пустое поле → прежняя ссылка по
 * умолчанию, чтобы ничего не «пропало» до заполнения админки.
 */
export type SocialNetwork = 'instagram' | 'facebook' | 'tiktok' | 'whatsapp' | 'telegram';

const DEFAULTS: Record<SocialNetwork, string> = {
  instagram: 'https://www.instagram.com/royal.home.tj/',
  facebook: 'https://www.facebook.com/people/Royalhometj/61583608873603/',
  tiktok: COMPANY_SOCIALS.tiktok,
  whatsapp: COMPANY_CONTACTS.whatsappHref,
  telegram: 'https://t.me/royalhome_tj',
};

function normalize(network: SocialNetwork, raw: string): string {
  // Never route messenger links to a mistaken CMS call number.
  if (network === 'whatsapp') return COMPANY_CONTACTS.whatsappHref;
  const v = raw.trim();
  if (!v) return DEFAULTS[network];
  if (v.startsWith('http://') || v.startsWith('https://')) return v;
  const handle = v.replace(/^@/, '');
  switch (network) {
    case 'instagram':
      return `https://www.instagram.com/${handle}/`;
    case 'facebook':
      return `https://www.facebook.com/${handle}`;
    case 'tiktok':
      return `https://www.tiktok.com/@${handle}`;
    case 'telegram':
      return `https://t.me/${handle}`;
  }
}

/** Ссылки всех ВКЛЮЧЁННЫХ в админке соцсетей, в стабильном порядке. */
export function socialUrls(site: Pick<SiteSettings, SocialNetwork | 'socialVisibility'>): Array<{ network: SocialNetwork; href: string }> {
  const order: SocialNetwork[] = ['instagram', 'facebook', 'tiktok', 'whatsapp', 'telegram'];
  return order
    .filter((n) => site.socialVisibility[n])
    .map((n) => ({ network: n, href: normalize(n, site[n] ?? '') }))
    .filter(link => Boolean(link.href));
}
