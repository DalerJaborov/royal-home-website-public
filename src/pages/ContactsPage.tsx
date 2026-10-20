import { useLocale } from '@/hooks/useLocale';
import { getLeadSubmissionSource } from '@/lib/acquisitionAttribution';
import { useState, type JSX } from 'react';
import { Link } from '@/components/LocalizedLink';
import { motion } from 'framer-motion';
import { Phone, Mail, MapPin, Clock, Check } from 'lucide-react';
import { TRPCClientError } from '@trpc/client';
import { useCreateLead } from '@/hooks/useCreateLead';
import { getTrpcErrorMessage } from '@/lib/utils';
import { useCms } from '../contexts/CmsContext';
import { useDocumentSeo } from '../hooks/useDocumentSeo';
import type { Translations } from '../data/translations';
import { useAntiSpam } from '@/hooks/useAntiSpam';
import HoneypotField from '@/components/HoneypotField';
import { socialUrls, type SocialNetwork } from '@/lib/socialLinks';
import { companyLegal } from '@/lib/companyLegal';
import { COMPANY_CONTACTS, COMPANY_HOURS } from '@contracts/company-contacts';
import WhatsAppIcon from '@/components/WhatsAppIcon';

/** Карта по умолчанию — виджет карточки организации в Яндекс.Бизнесе (oid), а не
 *  произвольная точка: посетитель видит отзывы и часы работы, а связка страницы с
 *  подтверждённой организацией работает на локальный поиск. Перебивается ссылкой
 *  из админки (Настройки сайта → Карта на странице «Контакты»). */
const ORG_MAP_WIDGET_URL = 'https://yandex.ru/map-widget/v1/?oid=153661125699&ol=biz&z=17';

// Ссылки берутся из CMS (Настройки сайта → Соцсети); здесь — только иконки и цвета.
const socials: Array<{ network: SocialNetwork; label: string; icon: JSX.Element; bg: string }> = [
  {
    network: 'instagram',
    label: 'Instagram',
    icon: (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
    ),
    bg: 'bg-gradient-to-tr from-purple-500 via-pink-500 to-yellow-500',
  },
  {
    network: 'facebook',
    label: 'Facebook',
    icon: (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
    ),
    bg: 'bg-[#1877F2]',
  },
  {
    network: 'tiktok',
    label: 'TikTok',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.88-2.88 2.89 2.89 0 012.88-2.88c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15.2a6.34 6.34 0 006.33 6.34 6.34 6.34 0 006.33-6.34V8.83a8.21 8.21 0 004.78 1.53V6.92a4.85 4.85 0 01-1-.23z"/></svg>
    ),
    bg: 'bg-black',
  },
  {
    network: 'whatsapp',
    label: 'WhatsApp',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
    ),
    bg: 'bg-[#25D366]',
  },
  {
    network: 'telegram',
    label: 'Telegram',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
    ),
    bg: 'bg-[#229ED9]',
  },
];

export default function ContactsPage({ t }: { t: Translations }) {
  const { text: tx, locale } = useLocale();
  const { cms } = useCms();
  const socialLinkMap = new Map(socialUrls(cms.site).map((s) => [s.network, s.href]));
  useDocumentSeo(cms.site.pageSeo.contacts.title, cms.site.pageSeo.contacts.description);
  const [form, setForm] = useState({ name: '', phone: '', topic: 'Покупка квартиры', message: '' });
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const createLead = useCreateLead();
  const { hp, setHp, getAntiSpamFields } = useAntiSpam('contact_lead');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await createLead.mutateAsync({
        name: form.name || undefined,
        phone: form.phone,
        message: [`Тема: ${form.topic}`, form.message].filter(Boolean).join('\n'),
        ...getLeadSubmissionSource('Контакты'),
        ...(await getAntiSpamFields()),
      });
      setSubmitted(true);
    } catch (err) {
      const fallback = 'Не удалось отправить сообщение. Попробуйте ещё раз или позвоните нам.';
      setError(err instanceof TRPCClientError ? getTrpcErrorMessage(err.message, fallback, tx, locale !== 'ru') : tx(fallback));
    }
  };

  return (
    <div className="pt-20 pb-16 lg:pb-4 min-h-screen bg-white">
      <div className="section-padding">
        {/* Hero */}
        <motion.div
          className="text-center mb-10 py-12 rounded-3xl bg-gradient-to-r from-emerald-50 to-gray-50 border border-gray-100"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h1 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-3">{tx(t.footer.contact)}</h1>
          <p className="text-gray-500 max-w-xl mx-auto px-4">
             {tx("Мы всегда на связи и готовы помочь вам с любыми вопросами недвижимости в Душанбе")} </p>
        </motion.div>

        <div className="grid lg:grid-cols-2 gap-8 max-w-5xl mx-auto">
          {/* Contact info */}
          <motion.div className="space-y-4" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
            <a href={COMPANY_CONTACTS.whatsappHref} target="_blank" rel="noopener noreferrer"
              className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#1a4d3a] text-white font-bold text-sm px-4 py-3 hover:brightness-95 transition-colors">
              <WhatsAppIcon className="w-5 h-5" /> {tx('Написать в WhatsApp')}
            </a>
            {[
              { icon: WhatsAppIcon, label: 'WhatsApp', value: COMPANY_CONTACTS.whatsappDisplay, href: COMPANY_CONTACTS.whatsappHref, desc: 'Написать ROYAL HOME в WhatsApp' },
              { icon: Phone, label: 'Колл-центр', value: COMPANY_CONTACTS.callDisplay, href: COMPANY_CONTACTS.callHref, desc: COMPANY_HOURS.display },
              { icon: Mail, label: 'Email', value: 'info@royalhome.tj', href: 'mailto:info@royalhome.tj', desc: 'Напишите об объекте или вашем вопросе' },
              { icon: MapPin, label: 'Адрес офиса', value: companyLegal.officeAddress, desc: 'Район И. Сомони, центр города — сюда приезжают клиенты' },
              { icon: Clock, label: 'График работы', value: COMPANY_HOURS.display, desc: 'Воскресенье — выходной' },
            ].map((item, i) => (
              <div
                key={i}
                className="flex items-start gap-4 p-5 rounded-2xl bg-gray-50 border border-gray-100 hover:border-gray-200 transition-all"
              >
                <div className={`glass-icon-tile ${i % 2 === 0 ? 'glass-icon-tile--emerald' : 'glass-icon-tile--gold'} w-12 h-12 rounded-2xl flex-shrink-0`}>
                  <item.icon className="relative z-10 w-5 h-5 text-[#1a4d3a]" />
                </div>
                <div>
                  <div className="text-xs text-gray-400 mb-0.5">{tx(item.label)}</div>
                  {item.href ? (
                    <a href={item.href} target={item.href.startsWith('https:') ? '_blank' : undefined} rel={item.href.startsWith('https:') ? 'noopener noreferrer' : undefined} className="inline-flex min-h-11 items-center text-lg font-bold text-gray-900 hover:text-emerald-800 transition-colors">
                      {tx(item.value)}
                    </a>
                  ) : (
                    <div className="text-lg font-bold text-gray-900">{tx(item.value)}</div>
                  )}
                  <div className="text-xs text-gray-400 mt-1">{tx(item.desc)}</div>
                </div>
              </div>
            ))}

            {/* Socials */}
            <div className="pt-4">
              <div className="text-sm text-gray-500 mb-3">{tx("Мы в соцсетях и мессенджерах:")}</div>
              <div className="flex flex-wrap gap-2">
                {socials.filter((s) => socialLinkMap.has(s.network)).map((s) => (
                  <a
                    key={s.label}
                    href={socialLinkMap.get(s.network)}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={tx(s.label)}
                    className={`w-10 h-10 rounded-full ${s.bg} flex items-center justify-center text-white hover:scale-110 transition-transform`}
                  >
                    {s.icon}
                  </a>
                ))}
              </div>
            </div>

          </motion.div>

          {/* Contact form */}
          <motion.div
            className="bg-gray-50 rounded-2xl p-6 border border-gray-100"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <h3 className="text-lg font-bold text-gray-900 mb-1">{tx("Напишите нам")}</h3>
            <p className="text-sm text-gray-500 mb-5">
               {tx("Заполните форму и мы свяжемся с вами в ближайшее время")} </p>
            {submitted ? (
              <div className="text-center py-8">
                <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                  <Check className="w-8 h-8 text-emerald-700" />
                </div>
                <p className="text-gray-900 font-semibold">{tx("Сообщение отправлено!")}</p>
                <p className="text-sm text-gray-500 mt-1">{tx("Мы свяжемся с вами в ближайшее время.")}</p>
              </div>
            ) : (
              <form className="space-y-4" onSubmit={handleSubmit}>
                <HoneypotField value={hp} onChange={setHp} />
                <div>
                  <label htmlFor="contacts-field-1" className="text-xs text-gray-500 mb-1 block">{tx("Ваше имя")}</label>
                  <input id="contacts-field-1"
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder={tx("Алишер")}
                    className="w-full px-4 py-3 rounded-xl bg-white border border-gray-200 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-800/30"
                  />
                </div>
                <div>
                  <label htmlFor="contacts-field-2" className="text-xs text-gray-500 mb-1 block">{tx("Ваш телефон")}</label>
                  <input id="contacts-field-2"
                    required
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="+992 (__) ___-__-__"
                    className="w-full px-4 py-3 rounded-xl bg-white border border-gray-200 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-800/30"
                  />
                </div>
                <div>
                  <label htmlFor="contacts-field-3" className="text-xs text-gray-500 mb-1 block">{tx("Тема обращения")}</label>
                  <select id="contacts-field-3"
                    value={form.topic}
                    onChange={(e) => setForm({ ...form, topic: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl bg-white border border-gray-200 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-800/30"
                  >
                    <option value="Покупка квартиры">{tx("Покупка квартиры")}</option>
                    <option value="Продажа квартиры">{tx("Продажа квартиры")}</option>
                    <option value="Ипотека">{tx("Ипотека")}</option>
                    <option value="Ремонт">{tx("Ремонт")}</option>
                    <option value="Другой вопрос">{tx("Другой вопрос")}</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="contacts-field-4" className="text-xs text-gray-500 mb-1 block">{tx("Сообщение")}</label>
                  <textarea id="contacts-field-4"
                    value={form.message}
                    onChange={(e) => setForm({ ...form, message: e.target.value })}
                    placeholder={tx("Опишите ваш вопрос...")}
                    rows={4}
                    className="w-full px-4 py-3 rounded-xl bg-white border border-gray-200 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-800/30 resize-none"
                  />
                </div>
                {error && (
                  <div className="px-4 py-2.5 rounded-xl bg-red-50 text-red-600 text-sm font-medium">
                    {tx(error)}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={createLead.isPending}
                  className="w-full py-3.5 rounded-xl font-bold transition-all hover:bg-[#FFD86A] bg-[#F6C453] text-gray-900 disabled:opacity-50"
                >
                  {createLead.isPending ? tx("Отправка...") : tx("Отправить сообщение")}
                </button>
                <p className="text-[10px] text-gray-400 text-center">
                   {tx("Нажимая кнопку, вы соглашаетесь с")}{tx(' ')}
                  <Link to="/privacy" className="underline hover:text-emerald-800 transition-colors">
                     {tx("политикой конфиденциальности")} </Link>
                </p>
              </form>
            )}
          </motion.div>
        </div>

        {/* Карта — отдельным широким блоком под колонками, как было раньше: на этой
            странице она главный ориентир, и в узкой колонке рядом с формой читалась
            хуже. Виджет привязан к профилю в Яндекс.Бизнесе (oid), а не к произвольной
            точке: посетитель видит отзывы и часы работы, а связка страницы с
            подтверждённой организацией работает на локальный поиск.
            loading="lazy" обязателен: iframe тянет тяжёлый скрипт карт, а блок лежит
            заметно ниже первого экрана. */}
        <motion.div
          className="mt-10 max-w-5xl mx-auto"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <div className="text-sm text-gray-500 mb-3">{tx("Как нас найти:")}</div>
          <div className="rounded-2xl overflow-hidden border border-gray-100 bg-gray-50 h-80">
            <iframe
              title={tx("Royal Home на карте Яндекса: Душанбе, улица Бухоро, 49")}
              src={cms.site.mapEmbedUrl || ORG_MAP_WIDGET_URL}
              loading="lazy"
              allowFullScreen
              className="w-full h-full border-0 block"
            />
          </div>
          <a
            href="https://yandex.ru/maps/org/153661125699/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 mt-2.5 text-sm font-semibold text-emerald-800 hover:text-emerald-900"
          >
            <MapPin className="w-4 h-4" />
             {tx("Построить маршрут в Яндекс.Картах")} </a>
        </motion.div>

        {/* Реквизиты. Нужны не только клиенту: по ним нас сверяют с государственным
            реестром — платёжные системы, площадки Meta, контрагенты. Юридический
            адрес намеренно отличается от адреса офиса выше и подменять его нельзя. */}
        <motion.section
          className="mt-10 max-w-5xl mx-auto"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="text-xl font-bold text-gray-900 mb-1">{tx("Юридическая информация")}</h2>
          <p className="text-sm text-gray-500 mb-5">
            {tx(companyLegal.brand)}  {tx("— торговая марка")} {tx(companyLegal.shortName)}
          </p>
          <dl className="grid sm:grid-cols-2 gap-x-8 gap-y-5 p-6 rounded-2xl bg-gray-50 border border-gray-100">
            <div className="sm:col-span-2">
              <dt className="text-xs text-gray-400 mb-1">{tx("Полное наименование")}</dt>
              <dd className="text-sm font-semibold text-gray-900">{tx(companyLegal.fullName)}</dd>
              <dd className="text-sm text-gray-500 mt-0.5">{tx(companyLegal.shortNameRu)}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs text-gray-400 mb-1">{tx("Юридический адрес")}</dt>
              <dd className="text-sm font-semibold text-gray-900">{tx(companyLegal.legalAddress)}</dd>
              <dd className="text-xs text-gray-400 mt-1">
                 {tx("Офис для клиентов находится по другому адресу —")} {tx(companyLegal.officeAddress)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gray-400 mb-1">{tx("ЕИН")}</dt>
              <dd className="text-sm font-semibold text-gray-900 tabular-nums">{tx(companyLegal.ein)}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-400 mb-1">{tx("ИНН")}</dt>
              <dd className="text-sm font-semibold text-gray-900 tabular-nums">{tx(companyLegal.tin)}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-400 mb-1">{tx("Дата государственной регистрации")}</dt>
              <dd className="text-sm font-semibold text-gray-900 tabular-nums">{tx(companyLegal.registeredAt)}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs text-gray-400 mb-1">{tx("Регистрирующий орган")}</dt>
              <dd className="text-sm text-gray-700">{tx(companyLegal.registrar)}</dd>
            </div>
          </dl>
        </motion.section>
      </div>
    </div>
  );
}
