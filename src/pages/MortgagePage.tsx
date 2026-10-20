import { useLocale } from '@/hooks/useLocale';
import { CORE_PAGE_SEO } from '@contracts/core-page-seo';
import { COMPANY_CONTACTS } from '@contracts/company-contacts';
import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calculator, ChevronDown, ChevronUp, Building2, Phone, HelpCircle } from 'lucide-react';
import { useCms } from '../contexts/CmsContext';
import { useSeo } from '../hooks/useSeo';
import { MORTGAGE_FAQ as MORTGAGE_FAQ_JSONLD } from '@contracts/faq-seo';

export default function MortgagePage() {
  const { text: tx } = useLocale();
  const { cms } = useCms();
  // ТЕКСТ ДОЛЖЕН СОВПАДАТЬ с api/lib/prerenderSeo.ts (STATIC_PAGES["/mortgage"]).
  // Сервер кладёт свой заголовок в исходный HTML, клиент переписывает его после
  // загрузки — и до этой правки на одном адресе жили два разных title: поисковик
  // и превью ссылки видели один, человек в заголовке вкладки другой.
  // Правильнее вынести STATIC_PAGES в contracts/ (как сделано для услуг в
  // contracts/services-seo.ts) — отдельная задача, здесь тексты просто сведены.
  //
  // jsonLd обязателен здесь — сервер уже вставил MORTGAGE_FAQ (contracts/faq-seo)
  // в исходный HTML (prerenderSeo.ts), а useSeo стирает предыдущий per-page
  // JSON-LD при каждом монтировании; без него FAQPage-разметка исчезала сразу
  // после гидратации. Импорт переименован в *_JSONLD — ниже уже есть свой
  // MORTGAGE_FAQ с текстами видимого аккордеона, это разные сущности.
  useSeo({
    ...CORE_PAGE_SEO['/mortgage'],
    jsonLd: MORTGAGE_FAQ_JSONLD,
  });
  const banks = cms.banks;
  const [price, setPrice] = useState(1_500_000);
  const [downPercent, setDownPercent] = useState(20);
  const [term, setTerm] = useState(10);
  const [selectedBankIdx, setSelectedBankIdx] = useState(0);
  const [showSchedule, setShowSchedule] = useState(false);
  const [activeFaq, setActiveFaq] = useState<number | null>(null);

  const down = Math.round(price * downPercent / 100);
  const loan = price - down;
  const bank = banks[Math.min(selectedBankIdx, banks.length - 1)];
  const rateMonthly = bank.rate / 100 / 12;
  const months = term * 12;

  const monthlyPayment = useMemo(() => {
    if (rateMonthly === 0) return loan / months;
    return loan * (rateMonthly * Math.pow(1 + rateMonthly, months)) / (Math.pow(1 + rateMonthly, months) - 1);
  }, [loan, rateMonthly, months]);

  const totalPayment = monthlyPayment * months;
  const overpayment = totalPayment - loan;

  const schedule = useMemo(() => {
    const rows = [];
    let balance = loan;
    for (let m = 1; m <= Math.min(months, 12); m++) {
      const interest = balance * rateMonthly;
      const principal = monthlyPayment - interest;
      balance -= principal;
      rows.push({ month: m, payment: monthlyPayment, principal, interest, balance: Math.max(0, balance) });
    }
    return rows;
  }, [loan, rateMonthly, months, monthlyPayment]);

  const STEPS = [
    { n: '1', title: 'Подать заявку', desc: 'Заполните форму на сайте или позвоните нам. Наш специалист уточнит ваши параметры.' },
    { n: '2', title: 'Подтверждение', desc: 'Помогаем уточнить сведения для заявки. Решение и срок рассмотрения определяет банк.' },
    { n: '3', title: 'Выбор квартиры', desc: 'После одобрения ипотеки подбираем квартиры по вашим критериям и организуем просмотры.' },
    { n: '4', title: 'Оформление', desc: 'Сопровождаем на всех этапах: договор, регистрация, передача ключей. Ваша квартира готова!' },
  ];

  const MORTGAGE_FAQ = [
    { q: 'Какой минимальный первоначальный взнос?', a: 'Размер первоначального взноса зависит от банка, программы и объекта. Уточните актуальное требование в выбранном банке.' },
    { q: 'Какие документы нужны для оформления ипотеки?', a: 'Точный перечень документов зависит от банка и программы. До подачи заявки уточните, как подтвердить личность, доход и сведения об объекте.' },
    { q: 'Сколько времени занимает одобрение?', a: 'Срок рассмотрения и решение по заявке определяет банк. Уточните срок для выбранной программы и полный перечень необходимых документов.' },
    { q: 'Можно ли оформить ипотеку без справки о доходах?', a: 'Требования к подтверждению дохода определяет банк. Уточните, какие документы он принимает и подходит ли вам выбранная программа.' },
    { q: 'Какой максимальный срок ипотеки?', a: 'Доступный срок зависит от банка, программы и параметров заявки. Сравните не только ежемесячный платёж, но и общую сумму выплат по актуальным условиям.' },
    { q: 'Можно ли досрочно погасить ипотеку?', a: 'Порядок досрочного погашения, возможные комиссии и ограничения уточните в выбранном банке и договоре.' },
  ];

  return (
    <div className="pt-20 pb-16 min-h-screen bg-white">
      <div className="section-padding">
        {/* Hero — светлая шапка в едином стиле с остальными страницами */}
        <motion.div
          className="text-center mb-12 pt-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h1 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-3">{tx("Ипотека в Таджикистане")}</h1>
          <p className="text-gray-500 max-w-2xl mx-auto px-4">
             {tx("Рассчитайте примерный платёж и обсудите покупку жилья. Актуальные условия и решение по заявке уточняйте у банка.")} </p>
        </motion.div>

        {/* Calculator + Banks */}
        <div className="grid lg:grid-cols-3 gap-6 max-w-6xl mx-auto mb-16">
          {/* Calculator */}
          <motion.div className="lg:col-span-1 bg-gray-50 rounded-2xl p-6 border border-gray-100 h-fit" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
            <h3 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
              <Calculator className="w-5 h-5 text-emerald-700" />  {tx("Калькулятор")} </h3>
            <div className="space-y-5">
              <div>
                <label htmlFor="mortgage-field-1" className="block text-sm font-medium text-gray-700 mb-1">{tx("Стоимость квартиры")}</label>
                <div className="text-2xl font-extrabold text-emerald-800 mb-2">{tx(price.toLocaleString('ru-RU'))} <span className="text-sm font-normal text-gray-500">{tx("с.")}</span></div>
                <input id="mortgage-field-1" type="range" min={300_000} max={5_000_000} step={50_000} value={price} onChange={e => setPrice(Number(e.target.value))} className="w-full accent-emerald-800" />
              </div>
              <div>
                <label htmlFor="mortgage-field-2" className="block text-sm font-medium text-gray-700 mb-1">{tx("Первоначальный взнос —")} {downPercent}%</label>
                <div className="text-lg font-bold text-gray-900 mb-2">{tx(down.toLocaleString('ru-RU'))} <span className="text-sm font-normal text-gray-500">{tx("с.")}</span></div>
                <input id="mortgage-field-2" type="range" min={10} max={90} step={5} value={downPercent} onChange={e => setDownPercent(Number(e.target.value))} className="w-full accent-emerald-800" />
              </div>
              <div>
                <label htmlFor="mortgage-field-3" className="block text-sm font-medium text-gray-700 mb-1">{tx("Срок кредита")}</label>
                <div className="text-lg font-bold text-gray-900 mb-2">{term} <span className="text-sm font-normal text-gray-500">{tx("лет")}</span></div>
                <input id="mortgage-field-3" type="range" min={1} max={20} step={1} value={term} onChange={e => setTerm(Number(e.target.value))} className="w-full accent-emerald-800" />
              </div>
              <div className="pt-4 border-t border-gray-200 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">{tx("Сумма кредита:")}</span>
                  <span className="font-bold text-gray-900">{tx(loan.toLocaleString('ru-RU'))}  {tx("с.")}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">{tx("Ставка:")}</span>
                  <span className="font-bold text-emerald-800">{bank.rate}{tx("% годовых")}</span>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Monthly payment */}
          <motion.div className="lg:col-span-1 space-y-6" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div className="bg-white rounded-2xl p-6 border-2 border-emerald-100 shadow-lg">
              <div className="text-sm text-gray-500 mb-1">{tx("Ежемесячный платеж")}</div>
              <div className="text-4xl font-extrabold text-emerald-800 mb-1">{tx(Math.round(monthlyPayment).toLocaleString('ru-RU'))}</div>
              <div className="text-sm text-gray-500">{tx("сомони / месяц")}</div>
              <p className="mt-4 text-sm leading-relaxed text-gray-600">{tx('Это пример расчёта по указанным параметрам. Актуальные условия и дополнительные расходы уточните у выбранного банка.')}</p>
              <div className="mt-4 pt-4 border-t border-gray-100">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Building2 className="w-4 h-4" />
                  <span>{tx("Банк:")} <span className="font-bold text-gray-900">{tx(bank.name)}</span></span>
                </div>
              </div>
              <a href={COMPANY_CONTACTS.callHref} className="w-full mt-4 py-3 rounded-xl text-white font-bold transition-all hover:opacity-90 flex items-center justify-center gap-2 text-center" style={{ backgroundColor: '#1a4d3a' }}>
                <Phone className="w-4 h-4" />  {tx("Получить консультацию")} </a>
            </div>

            <button onClick={() => setShowSchedule(!showSchedule)} className="w-full flex items-center justify-between p-4 rounded-2xl bg-gray-50 border border-gray-100 hover:bg-gray-100 transition-colors">
              <span className="font-semibold text-gray-900">{tx("График платежей (1-й год)")}</span>
              {showSchedule ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
            </button>
            <AnimatePresence>
              {showSchedule && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                  <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50">
                        <tr className="text-gray-500">
                          <th className="px-3 py-2 text-left">{tx("Месяц")}</th>
                          <th className="px-3 py-2 text-right">{tx("Платёж")}</th>
                          <th className="px-3 py-2 text-right">{tx("Остаток")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {schedule.map((row) => (
                          <tr key={row.month} className="border-t border-gray-50">
                            <td className="px-3 py-2">{row.month}</td>
                            <td className="px-3 py-2 text-right font-semibold">{tx(Math.round(row.payment).toLocaleString())}</td>
                            <td className="px-3 py-2 text-right">{tx(Math.round(row.balance).toLocaleString())}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Bank selection */}
          <motion.div className="lg:col-span-1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
            <h3 className="text-lg font-bold text-gray-900 mb-4">{tx("Выберите банк")}</h3>
            <div className="space-y-3">
              {banks.map((b, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedBankIdx(i)}
                  className={`w-full flex items-center gap-4 p-4 rounded-2xl border transition-all text-left ${
                    selectedBankIdx === i ? 'border-emerald-500 bg-emerald-50 shadow-sm' : 'border-gray-100 bg-gray-50 hover:bg-gray-100'
                  }`}
                >
                  <div className="w-24 h-20 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm p-2.5" style={{ backgroundColor: b.bg }}>
                    <img src={b.logo} alt={tx(b.name)} loading="lazy" decoding="async" className="w-full h-full object-contain" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-gray-900 text-sm">{tx(b.name)}</div>
                    <div className="text-xs text-gray-500">{tx("Ставка:")} <span className="font-bold text-emerald-800">{b.rate}%</span></div>
                    {b.note && <div className="text-[11px] text-gray-400 mt-0.5">{tx(b.note)}</div>}
                  </div>
                  {selectedBankIdx === i && (
                    <div className="w-5 h-5 rounded-full bg-emerald-600 flex items-center justify-center flex-shrink-0">
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                    </div>
                  )}
                </button>
              ))}
            </div>
            <div className="mt-6 p-4 rounded-2xl bg-amber-50 border border-amber-100">
              <div className="text-sm font-semibold text-gray-900 mb-2">{tx("Итого за")} {term}  {tx("лет:")}</div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-600">{tx("Выплачено:")}</span>
                <span className="font-bold">{tx(Math.round(totalPayment).toLocaleString())}  {tx("с.")}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">{tx("Переплата:")}</span>
                <span className="font-bold text-amber-700">{tx(Math.round(overpayment).toLocaleString())}  {tx("с.")}</span>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Steps */}
        <motion.div className="mb-16" initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
          <h2 className="text-2xl font-bold text-gray-900 mb-8 text-center">{tx("Как получить ипотеку")}</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {STEPS.map((step, i) => (
              <motion.div key={i} className="relative p-6 rounded-2xl bg-gray-50 border border-gray-100" initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}>
                <div className="w-10 h-10 rounded-full bg-emerald-800 flex items-center justify-center text-white font-bold text-lg mb-4">{tx(step.n)}</div>
                <h3 className="font-bold text-gray-900 mb-2">{tx(step.title)}</h3>
                <p className="text-sm text-gray-500">{tx(step.desc)}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* FAQ */}
        <motion.div className="mb-16" initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
          <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center flex items-center justify-center gap-2">
            <HelpCircle className="w-6 h-6 text-emerald-700" />  {tx("Вопросы об ипотеке")} </h2>
          <div className="max-w-3xl mx-auto space-y-3">
            {MORTGAGE_FAQ.map((item, i) => (
              <div key={i} className="border border-gray-100 rounded-2xl overflow-hidden">
                <button onClick={() => setActiveFaq(activeFaq === i ? null : i)} className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors">
                  <span className="font-semibold text-gray-900 text-sm pr-4">{tx(item.q)}</span>
                  {activeFaq === i ? <ChevronUp className="w-5 h-5 text-gray-400 flex-shrink-0" /> : <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" />}
                </button>
                <AnimatePresence>
                  {activeFaq === i && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <p className="px-4 pb-4 text-sm text-gray-600">{tx(item.a)}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </motion.div>

        {/* CTA */}
        <motion.div className="p-8 rounded-2xl text-center" style={{ background: 'linear-gradient(135deg, #1a4d3a, #0f2e22)' }} initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}>
          <h3 className="text-xl font-bold text-white mb-2">{tx("Готовы оформить ипотеку?")}</h3>
          <p className="text-white/70 mb-6 max-w-xl mx-auto">{tx("Первая консультация бесплатно!")}</p>
          <a href={COMPANY_CONTACTS.callHref} className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-amber-400 text-gray-900 font-bold transition-all hover:bg-amber-300">
            <Phone className="w-5 h-5" />  {tx("Получить консультацию")} </a>
        </motion.div>
      </div>
    </div>
  );
}
