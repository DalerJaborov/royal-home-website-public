import { describe, expect, it } from 'vitest';
import { socialUrls } from './socialLinks';
describe('approved WhatsApp destination', () => {
  it('a mistaken CMS number cannot redirect customers to the call line', () => {
    const links = socialUrls({ whatsapp: '+992446501414', instagram: '', facebook: '', tiktok: '', telegram: '', socialVisibility: { instagram: false, facebook: false, tiktok: false, telegram: false, whatsapp: true } });
    expect(links).toEqual([{ network: 'whatsapp', href: 'https://wa.me/992777776001' }]);
  });
  it('a hidden social entry stays hidden without changing its approved destination', () => {
    expect(socialUrls({ whatsapp: '+992777776001', instagram: '', facebook: '', tiktok: '', telegram: '', socialVisibility: { instagram: false, facebook: false, tiktok: false, telegram: false, whatsapp: false } })).toEqual([]);
  });
  it('uses the confirmed TikTok when an enabled setting is empty', () => {
    expect(socialUrls({ whatsapp: '', instagram: '', facebook: '', tiktok: '', telegram: '', socialVisibility: { instagram: false, facebook: false, tiktok: true, telegram: false, whatsapp: false } })).toEqual([{ network: 'tiktok', href: 'https://www.tiktok.com/@royal.home.tjk' }]);
  });
});
