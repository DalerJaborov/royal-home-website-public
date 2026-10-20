import { useLocale } from '@/hooks/useLocale';
import { COMPANY_CONTACTS } from '@contracts/company-contacts';
import type { JSX } from 'react';
import { Link } from '@/components/LocalizedLink';
import { Phone, Mail, MapPin } from 'lucide-react';
import AppInstallButtons from './AppInstallButtons';
import LanguageSwitcher from './LanguageSwitcher';
import { useCms } from '@/contexts/CmsContext';
import { socialUrls, type SocialNetwork } from '@/lib/socialLinks';
import { companyLegal } from '@/lib/companyLegal';
import DistrictLinks from './DistrictLinks';
import WhatsAppIcon from './WhatsAppIcon';

const footerLinks = {
  company: [
    { label: 'О нас', to: '/about' },
    { label: 'Блог', to: '/blog' },
    { label: 'Контакты', to: '/contacts' },
    { label: 'Политика конфиденциальности', to: '/privacy' },
  ],
  services: [
    { label: 'Покупка', to: '/listings' },
    { label: 'Продажа', to: '/sell' },
    { label: 'Ипотека', to: '/mortgage' },
    { label: 'Оценка', to: '/sell' },
  ],
};

// Ссылки берутся из CMS (Настройки сайта → Соцсети, см. src/lib/socialLinks.ts);
// здесь остаются только иконки и фирменные цвета сетей.
const socials: Array<{ network: SocialNetwork; label: string; icon: JSX.Element; bg: string }> = [
  {
    network: 'instagram',
    label: 'Instagram',
    icon: (
      <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
    ),
    bg: 'bg-gradient-to-tr from-purple-500 via-pink-500 to-yellow-500',
  },
  {
    network: 'facebook',
    label: 'Facebook',
    icon: (
      <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
    ),
    bg: 'bg-[#1877F2]',
  },
  {
    network: 'tiktok',
    label: 'TikTok',
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.88-2.88 2.89 2.89 0 012.88-2.88c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15.2a6.34 6.34 0 006.33 6.34 6.34 6.34 0 006.33-6.34V8.83a8.21 8.21 0 004.78 1.53V6.92a4.85 4.85 0 01-1-.23z"/></svg>
    ),
    bg: 'bg-black',
  },
  {
    network: 'whatsapp',
    label: 'WhatsApp',
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
    ),
    bg: 'bg-[#25D366]',
  },
  {
    network: 'telegram',
    label: 'Telegram',
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
    ),
    bg: 'bg-[#229ED9]',
  },
];

export default function Footer() {
  const { text: tx } = useLocale();
  const { cms } = useCms();
  const links = new Map(socialUrls(cms.site).map((s) => [s.network, s.href]));
  return (
    <footer className="bg-[#0c1310] text-white">
      {/* Main footer */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-14 pb-10">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 lg:gap-8">
          {/* Brand + socials + text */}
          <div className="space-y-5">
            <div className="flex items-center gap-2.5">
              <img
                src="/images/logo-royal-2026.webp"
                alt="ROYAL HOME"
                className="w-10 h-10 rounded-xl object-contain"
              />
              <span className="text-xl font-bold">ROYAL HOME</span>
            </div>
            <p className="text-sm text-gray-400 leading-relaxed">
               {tx("Надёжное агентство недвижимости в Душанбе. Проверенные квартиры, профессиональные риелторы и полное юридическое сопровождение сделок.")} </p>
            <div className="flex items-center gap-3">
              {socials
                .filter((s) => links.has(s.network))
                .map((s) => (
                  <a
                    key={s.label}
                    href={links.get(s.network)}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={tx(s.label)}
                    className={`w-12 h-12 rounded-full ${s.bg} flex items-center justify-center text-white hover:scale-110 transition-transform`}
                  >
                    {s.icon}
                  </a>
                ))}
            </div>
            <AppInstallButtons compact variant="dark" />
            <div className="footer-language"><LanguageSwitcher /></div>
          </div>

          {/* Contacts */}
          <div className="space-y-5">
            <h3 className="text-lg font-semibold">{tx("Связь с нами")}</h3>
            <ul className="space-y-3.5">
              <li>
                <a href={COMPANY_CONTACTS.whatsappHref} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors">
                  <WhatsAppIcon className="w-4 h-4 shrink-0 text-emerald-400" /> WhatsApp · {COMPANY_CONTACTS.whatsappDisplay}
                </a>
              </li>
              <li>
                <a href={COMPANY_CONTACTS.callHref} className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors">
                  <Phone className="w-4 h-4 text-emerald-400" /> {tx(COMPANY_CONTACTS.callDisplay)}
                </a>
              </li>
              <li>
                <a href="mailto:info@royalhome.tj" className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors">
                  <Mail className="w-4 h-4 text-emerald-400" /> info@royalhome.tj
                </a>
              </li>
              <li>
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <MapPin className="w-4 h-4 text-emerald-400" /> {tx(companyLegal.officeAddress)}
                </div>
              </li>
            </ul>
          </div>

          {/* Company */}
          <div className="space-y-5">
            <h3 className="text-lg font-semibold">{tx("Компания")}</h3>
            <ul className="space-y-3.5">
              {footerLinks.company.map((link) => (
                <li key={link.label}>
                  <Link to={link.to} className="text-sm text-gray-400 hover:text-white transition-colors">
                    {tx(link.label)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Services */}
          <div className="space-y-5">
            <h3 className="text-lg font-semibold">{tx("Услуги")}</h3>
            <ul className="space-y-3.5">
              {footerLinks.services.map((link) => (
                <li key={link.label}>
                  <Link to={link.to} className="text-sm text-gray-400 hover:text-white transition-colors">
                    {tx(link.label)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Реквизиты. Отдельной полосой над копирайтом: это не контакты для связи,
          а юридические данные — их ищут глазами, а не кликают. */}
      <div className="footer-legal border-t border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-3 text-xs leading-relaxed text-gray-400">
            <div>
              <dt className="text-gray-400">{tx("Юридическое лицо")}</dt>
              <dd className="text-gray-400 mt-0.5">{tx(companyLegal.shortName)}</dd>
              <dd className="text-gray-400">{tx(companyLegal.shortNameRu)}</dd>
            </div>
            <div>
              <dt className="text-gray-400">{tx("Юридический адрес")}</dt>
              <dd className="text-gray-400 mt-0.5">{tx(companyLegal.legalAddress)}</dd>
            </div>
            <div>
              <dt className="text-gray-400">{tx("Реквизиты")}</dt>
              <dd className="text-gray-400 mt-0.5">{tx("ЕИН")} {tx(companyLegal.ein)}</dd>
              <dd className="text-gray-400">{tx("ИНН")} {tx(companyLegal.tin)}</dd>
            </div>
            <div>
              <dt className="text-gray-400">{tx("Государственная регистрация")}</dt>
              <dd className="text-gray-400 mt-0.5">{tx("от")} {tx(companyLegal.registeredAt)}</dd>
              <dd className="text-gray-400">{tx(companyLegal.registrar)}</dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8"><DistrictLinks dark /></div>
      <div className="footer-copyright border-t border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-center">
            <span className="text-sm text-gray-400 text-center">
              © {new Date().getFullYear()} {tx(companyLegal.brand)}  {tx("— торговая марка")} {tx(companyLegal.shortName)}{tx(". Все права защищены.")} </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
