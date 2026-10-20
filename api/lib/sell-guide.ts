import { SELL_GUIDE } from '@contracts/sell-guide';
import { localizedPath, type PublicLocale } from '@contracts/public-i18n';
const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function sellGuideHtml(locale: PublicLocale) {
  const guide=SELL_GUIDE[locale];
  return `<h2>${esc(guide.title)}</h2>${guide.sections.map(s=>`<h3>${esc(s.title)}</h3><p>${esc(s.text)}</p>`).join('')}<p><a href="${localizedPath('/services/buyout',locale)}">${esc(guide.buyout)}</a> · <a href="${localizedPath('/contacts',locale)}">${esc(guide.contacts)}</a></p>`;
}
