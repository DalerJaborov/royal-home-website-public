import { useLocale } from '@/hooks/useLocale';
import { getLeadSubmissionSource } from '@/lib/acquisitionAttribution';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from '@/components/LocalizedLink';
import { MapPin, Phone, User, Check, ArrowRight, ArrowLeft, Home, Building2, Landmark, Trees, ShieldCheck, Clock, BadgePercent } from 'lucide-react';
import { TRPCClientError } from '@trpc/client';
import { useCreateLead } from '@/hooks/useCreateLead';
import { getTrpcErrorMessage } from '@/lib/utils';
import { useAntiSpam } from '@/hooks/useAntiSpam';
import HoneypotField from '@/components/HoneypotField';
import { useSeo } from '../hooks/useSeo';
import { CORE_PAGE_SEO } from '@contracts/core-page-seo';
import { SELL_GUIDE } from '@contracts/sell-guide';

const PROPERTY_TYPES = [
  { label: 'Квартира', icon: Building2 },
  { label: 'Дом', icon: Home },
  { label: 'Коммерческая', icon: Landmark },
  { label: 'Участок', icon: Trees },
];
const ROOM_OPTIONS = ['1', '2', '3', '4', '5+'];

export default function SellPage() {
  const { text: tx, locale } = useLocale();
  const guide = SELL_GUIDE[locale];
  useSeo({
    ...CORE_PAGE_SEO['/sell'],
  });
  const [step, setStep] = useState<1 | 2>(1);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    name: '', phone: '', address: '', rooms: '', area: '', floor: '', price: '', type: 'Квартира', comment: ''
  });
  const createLead = useCreateLead();
  const { hp, setHp, getAntiSpamFields } = useAntiSpam('sell_lead');

  const inputCls = 'w-full px-4 py-3.5 rounded-xl bg-gray-50 border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-800/30 focus:border-emerald-800/30 transition-all';
  const labelCls = 'block text-sm font-semibold text-gray-700 mb-2';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const details = [
      form.address && `Адрес: ${form.address}`,
      form.type && `Тип: ${form.type}`,
      form.rooms && `Комнат: ${form.rooms}`,
      form.area && `Площадь: ${form.area} м²`,
      form.floor && `Этаж: ${form.floor}`,
      form.price && `Ожидаемая цена: ${form.price} с.`,
      form.comment,
    ].filter(Boolean).join('\n');

    try {
      await createLead.mutateAsync({
        name: form.name || undefined,
        phone: form.phone,
        message: details,
        ...getLeadSubmissionSource('Продать квартиру'),
        ...(await getAntiSpamFields()),
      });
      setSubmitted(true);
    } catch (err) {
      const fallback = 'Не удалось отправить заявку. Попробуйте ещё раз или позвоните нам.';
      setError(err instanceof TRPCClientError ? getTrpcErrorMessage(err.message, fallback, tx, locale !== 'ru') : tx(fallback));
    }
  };

  if (submitted) {
    return (
      <div className="pt-20 pb-16 min-h-screen bg-white flex items-center justify-center">
        <motion.div className="text-center p-8 max-w-md" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
          <motion.div
            className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-6"
            initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', delay: 0.15 }}
          >
            <Check className="w-10 h-10 text-emerald-700" />
          </motion.div>
          <h2 className="text-2xl font-bold text-gray-900 mb-3">{tx("Заявка принята!")}</h2>
          <p className="text-gray-500 mb-6">{tx('Спасибо за обращение. Специалист свяжется с вами, чтобы обсудить объект и следующие шаги.')}</p>
          <Link to="/" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-white font-semibold" style={{ backgroundColor: '#1a4d3a' }}>{tx("На главную")}</Link>
        </motion.div>
      </div>
    );
  }

  const stepOneValid = form.address.trim().length > 3;

  return (
    <div className="pt-20 pb-16 lg:pb-4 min-h-screen bg-white">
      <div className="section-padding max-w-2xl mx-auto">
        {/* Hero */}
        <motion.div
          className="relative text-center mb-8 py-10 px-6 rounded-3xl overflow-hidden"
          style={{ background: 'linear-gradient(135deg, #1a4d3a, #0f2e22)' }}
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        >
          <div className="absolute -top-10 -right-10 w-44 h-44 rounded-full bg-white/5" />
          <div className="absolute -bottom-14 -left-8 w-52 h-52 rounded-full bg-white/5" />
          <h1 className="relative text-3xl font-bold text-white mb-2">{tx("Продать квартиру")}</h1>
          <p className="relative text-white/70 max-w-sm mx-auto">{tx('Расскажите об объекте — обсудим задачу по продаже и порядок работы')}</p>
        </motion.div>

        {/* Steps indicator */}
        <div className="flex items-center justify-center gap-3 mb-6">
          {[1, 2].map((s) => (
            <div key={s} className="flex items-center gap-3">
              <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-all ${
                step === s ? 'bg-emerald-800 text-white shadow-md' : step > s ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-400'
              }`}>
                {step > s ? <Check className="w-4 h-4" /> : <span>{s}</span>}
                {s === 1 ? tx("О квартире") : tx("Контакты")}
              </div>
              {s === 1 && <div className={`w-8 h-0.5 rounded ${step === 2 ? 'bg-emerald-800' : 'bg-gray-200'}`} />}
            </div>
          ))}
        </div>

        <motion.form
          onSubmit={handleSubmit}
          className="bg-white rounded-3xl p-6 lg:p-8 border border-gray-100 shadow-[0_8px_40px_rgba(0,0,0,0.06)]"
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        >
          <HoneypotField value={hp} onChange={setHp} />
          <AnimatePresence mode="wait">
            {step === 1 ? (
              <motion.div key="step1" initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.25 }} className="space-y-6">
                <div>
                  <label className={labelCls}>{tx("Что продаёте?")}</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {PROPERTY_TYPES.map(({ label, icon: Icon }) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => setForm({ ...form, type: label })}
                        aria-pressed={form.type === label}
                        className={`flex flex-col items-center gap-1.5 px-3 py-3.5 rounded-2xl border text-xs font-semibold transition-all ${
                          form.type === label
                            ? 'border-emerald-800 bg-emerald-800/5 text-emerald-900 shadow-sm'
                            : 'border-gray-200 bg-gray-50 text-gray-500 hover:border-gray-300'
                        }`}
                      >
                        <Icon className={`w-5 h-5 ${form.type === label ? 'text-emerald-800' : 'text-gray-400'}`} />
                        {tx(label)}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label htmlFor="sell-field-1" className={labelCls}>{tx("Адрес объекта *")}</label>
                  <div className="relative">
                    <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input id="sell-field-1" required type="text" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} className={`${inputCls} pl-10`} placeholder={tx("Душанбе, р-н Сино, ул. Айни, 12")} />
                  </div>
                </div>

                <div>
                  <label className={labelCls}>{tx("Сколько комнат?")}</label>
                  <div className="flex gap-2">
                    {ROOM_OPTIONS.map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setForm({ ...form, rooms: form.rooms === r ? '' : r })}
                        aria-pressed={form.rooms === r}
                        className={`w-12 h-12 rounded-xl border font-bold text-sm transition-all ${
                          form.rooms === r
                            ? 'border-emerald-800 bg-emerald-800 text-white shadow-md'
                            : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300'
                        }`}
                      >
                        {tx(r)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label htmlFor="sell-field-2" className={labelCls}>{tx("Площадь, м²")}</label>
                    <input id="sell-field-2" type="number" value={form.area} onChange={e => setForm({ ...form, area: e.target.value })} className={inputCls} placeholder="78" />
                  </div>
                  <div>
                    <label htmlFor="sell-field-3" className={labelCls}>{tx("Этаж")}</label>
                    <input id="sell-field-3" type="text" value={form.floor} onChange={e => setForm({ ...form, floor: e.target.value })} className={inputCls} placeholder="5/9" />
                  </div>
                  <div>
                    <label htmlFor="sell-field-4" className={labelCls}>{tx("Цена, с.")}</label>
                    <input id="sell-field-4" type="number" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} className={inputCls} placeholder="1 200 000" />
                  </div>
                </div>

                <button
                  type="button"
                  disabled={!stepOneValid}
                  onClick={() => setStep(2)}
                  className="w-full py-4 rounded-xl font-bold text-base transition-all hover:brightness-105 active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-[0_4px_18px_rgba(246,196,83,0.35)]"
                  style={{ backgroundColor: '#F6C453', color: '#0f2e22' }}
                >
                   {tx("Далее — контакты")} <ArrowRight className="w-5 h-5" />
                </button>
                {!stepOneValid && <p className="text-xs text-gray-400 text-center -mt-2">{tx("Укажите адрес, чтобы продолжить")}</p>}
              </motion.div>
            ) : (
              <motion.div key="step2" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }} transition={{ duration: 0.25 }} className="space-y-6">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="sell-field-5" className={labelCls}>{tx("Ваше имя *")}</label>
                    <div className="relative">
                      <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input id="sell-field-5" required type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={`${inputCls} pl-10`} placeholder={tx("Алишер")} />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="sell-field-6" className={labelCls}>{tx("Телефон *")}</label>
                    <div className="relative">
                      <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input id="sell-field-6" required type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className={`${inputCls} pl-10`} placeholder="+992 XX XXX XX XX" />
                    </div>
                  </div>
                </div>

                <div>
                  <label htmlFor="sell-field-7" className={labelCls}>{tx("Комментарий")}</label>
                  <textarea id="sell-field-7" value={form.comment} onChange={e => setForm({ ...form, comment: e.target.value })} rows={3} className={`${inputCls} resize-none`} placeholder={tx("Например: свежий ремонт, мебель остаётся, продажа срочная...")} />
                </div>

                {error && (
                  <div className="px-4 py-2.5 rounded-xl bg-red-50 text-red-600 text-sm font-medium">{tx(error)}</div>
                )}

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="px-5 py-4 rounded-xl border border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 transition-colors flex items-center gap-2"
                  >
                    <ArrowLeft className="w-4 h-4" />  {tx("Назад")} </button>
                  <button
                    type="submit"
                    disabled={createLead.isPending}
                    className="flex-1 py-4 rounded-xl font-bold text-base transition-all hover:brightness-105 active:scale-[0.99] disabled:opacity-50 shadow-[0_4px_18px_rgba(246,196,83,0.35)]"
                    style={{ backgroundColor: '#F6C453', color: '#0f2e22' }}
                  >
                    {createLead.isPending ? tx("Отправка...") : tx("Отправить заявку")}
                  </button>
                </div>
                <p className="text-xs text-gray-400 text-center">{tx("Нажимая на кнопку, вы соглашаетесь на обработку персональных данных")}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.form>

        {/* Trust markers */}
        <div className="mt-8 grid grid-cols-3 gap-3">
          {[
            { icon: Clock, n: 'Обращение', l: 'расскажите о задаче' },
            { icon: ShieldCheck, n: 'Объект', l: 'уточним сведения' },
            { icon: BadgePercent, n: 'Условия', l: 'обсудим порядок работы' },
          ].map(({ icon: Icon, n, l }, i) => (
            <motion.div key={i} className="text-center p-4 rounded-2xl bg-gray-50 border border-gray-100" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + i * 0.05 }}>
              <Icon className="w-5 h-5 text-emerald-800 mx-auto mb-1.5" />
              <div className="text-lg font-extrabold text-gray-900 leading-tight">{tx(n)}</div>
              <div className="text-[11px] text-gray-500">{tx(l)}</div>
            </motion.div>
          ))}
        </div>
        <section className="mt-12 mb-8 space-y-6" aria-labelledby="seller-guide-title">
          <h2 id="seller-guide-title" className="text-2xl font-bold text-gray-900">{guide.title}</h2>
          {guide.sections.map(section => <div key={section.title}>
            <h3 className="mb-2 text-base font-semibold text-gray-900">{section.title}</h3>
            <p className="text-sm leading-7 text-gray-600">{section.text}</p>
          </div>)}
          <div className="flex flex-wrap gap-x-5 gap-y-3 text-sm font-semibold text-emerald-800">
            <Link to="/services/buyout" className="underline underline-offset-4">{guide.buyout}</Link>
            <Link to="/contacts" className="underline underline-offset-4">{guide.contacts}</Link>
          </div>
        </section>
      </div>
    </div>
  );
}
