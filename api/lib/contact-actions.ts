import { COMPANY_CONTACTS } from '@contracts/company-contacts';
import { localizedPath, type PublicLocale } from '@contracts/public-i18n';

/** Contact actions in initial HTML, before the browser runs the application. */
export function contactActionsHtml(locale: PublicLocale = 'ru', listing?: { id: number; sold: boolean; crmShortId?: number | null }) {
  if (listing?.sold) return '';
  const copy = {
    ru: { whatsapp: 'Написать в WhatsApp', call: 'Позвонить', message: 'Здравствуйте! Интересует объект' },
    tg: { whatsapp: 'Дар WhatsApp нависед', call: 'Занг занед', message: 'Салом! Ба ман объекти' },
    en: { whatsapp: 'Message on WhatsApp', call: 'Call', message: "Hello! I'm interested in property" },
  }[locale];
  // Only the CRM card number is a listing number; without it the message is just the link.
  const number = listing?.crmShortId && listing.crmShortId > 0 ? listing.crmShortId : undefined;
  const reference = number ? ` №${number}` : '';
  const url = listing ? `https://royalhome.tj${localizedPath(`/listing/${listing.id}`, locale)}` : '';
  const message = !listing ? '' : number ? `${copy.message}${reference}${locale === 'tg' ? ' ҷолиб аст' : ''}: ${url}` : url;
  const href = COMPANY_CONTACTS.whatsappHref + (message ? `?text=${encodeURIComponent(message)}` : '');
  return `<p><a href="${href}" target="_blank" rel="noopener noreferrer">${copy.whatsapp}${reference ? ` ·${reference}` : ''} · ${COMPANY_CONTACTS.whatsappDisplay}</a></p><p><a href="${COMPANY_CONTACTS.callHref}">${copy.call} · ${COMPANY_CONTACTS.callDisplay}</a></p>`;
}
