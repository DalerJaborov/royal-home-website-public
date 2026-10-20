import { useLocale } from '@/hooks/useLocale';
import { COMPANY_CONTACTS } from '@contracts/company-contacts';
import { motion } from 'framer-motion';
import { Shield, Award, Users, TrendingUp, Star, MapPin, Check, Phone } from 'lucide-react';
import { Link } from '@/components/LocalizedLink';
import { useCms } from '../contexts/CmsContext';
import { useDocumentSeo } from '../hooks/useDocumentSeo';

const VALUES = [
  'Честность и прозрачность в каждой сделке',
  'Клиент всегда на первом месте',
  'Постоянное развитие и обучение',
  'Командная работа и взаимопомощь',
];

const WHY_US = [
  { title: 'Проверка объектов', desc: 'Каждая квартира тщательно проверяется перед размещением на сайте' },
  { title: 'Проверенные застройщики', desc: 'Работаем только с надёжными застройщиками с безупречной репутацией' },
  { title: 'Юридическое сопровождение', desc: 'Полное сопровождение сделки юристами компании' },
  { title: 'Ипотека', desc: 'Обсуждаем покупку жилья и подготовку обращения в выбранный банк' },
  { title: 'Безопасность расчётов', desc: 'Обсуждаем документы и условия расчётов по планируемой сделке' },
  { title: 'Поддержка 7 дней', desc: 'Наша команда доступна для вас каждый день недели' },
];

export default function AboutPage() {
  const { text: tx } = useLocale();
  const { cms } = useCms();
  useDocumentSeo(cms.site.pageSeo.about.title, cms.site.pageSeo.about.description);
  return (
    <div className="pt-20 pb-16 lg:pb-4 min-h-screen bg-white overflow-x-clip">
      <div className="section-padding">
        {/* Hero */}
        <motion.div
          className="relative rounded-3xl overflow-hidden mb-12"
          style={{ background: 'linear-gradient(135deg, #1a4d3a, #0f2e22)' }}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="absolute top-1/4 right-1/4 w-64 h-64 rounded-full opacity-20" style={{ background: 'radial-gradient(circle, #c9a84c 0%, transparent 70%)', filter: 'blur(60px)' }} />
          <div className="relative z-10 py-16 px-8 text-center">
            <h1 className="text-3xl lg:text-5xl font-black text-white mb-4">ROYAL HOME</h1>
            <p className="text-white/70 max-w-2xl mx-auto text-lg mb-6">
               {tx("Надёжное агентство недвижимости в Душанбе. Помогаем найти идеальный дом — честно и под ключ.")} </p>
            <div className="flex flex-wrap justify-center gap-4 text-white/60 text-sm">
              <span className="flex items-center gap-1.5"><MapPin className="w-4 h-4" />  {tx("г. Душанбе, ул. Бухоро 49")}</span>
              <span className="flex items-center gap-1.5"><Star className="w-4 h-4" />  {tx("Проверенные объекты")}</span>
              <span className="flex items-center gap-1.5"><Phone className="w-4 h-4" /> {tx(COMPANY_CONTACTS.callDisplay)}</span>
            </div>
          </div>
        </motion.div>

        {/* Принципы вместо выдуманных цифр — компания новая, врать «7 лет опыта» нельзя */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-16">
          {[
            { icon: Shield, label: 'Юридическая проверка каждого объекта' },
            { icon: Award, label: 'Сопровождение сделки под ключ' },
            { icon: Users, label: 'Личный риелтор на весь срок поиска' },
            { icon: TrendingUp, label: 'Честная цена — без скрытых комиссий' },
          ].map((s, i) => (
            <motion.div
              key={i}
              className="text-center p-6 rounded-2xl bg-gray-50 border border-gray-100 hover:shadow-md hover:-translate-y-0.5 transition-all"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1, type: 'spring', stiffness: 120 }}
            >
              <s.icon className="w-8 h-8 text-emerald-800 mx-auto mb-3" />
              <div className="text-sm font-semibold text-gray-700 leading-snug">{tx(s.label)}</div>
            </motion.div>
          ))}
        </div>

        {/* About text */}
        <div className="grid lg:grid-cols-2 gap-8 mb-16">
          <motion.div initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">{tx("О компании")}</h2>
            <div className="space-y-4 text-gray-600 text-sm leading-relaxed">
              <p>
                <strong className="text-gray-900">ROYAL HOME</strong>  {tx("— молодое агентство недвижимости в Душанбе. Мы построили его вокруг простой идеи: клиент должен быть уверен в честности и профессионализме на каждом этапе сделки.")} </p>
              <p>
                 {tx("Каждый объект в нашей базе проверяется юридически до публикации, а риелтор сопровождает клиента от первого показа до передачи ключей. Royal Home — это экосистема услуг для комфортной жизни: от подбора квартиры до ремонта и дизайна интерьера.")} </p>
            </div>
          </motion.div>
          <motion.div
            className="rounded-2xl overflow-hidden"
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
          >
            <img src="/images/hero-bg.webp" alt={tx("Душанбе")} loading="lazy" decoding="async" className="w-full h-full object-cover min-h-[280px] rounded-2xl" />
          </motion.div>
        </div>

        {/* Mission & Values */}
        <div className="grid lg:grid-cols-2 gap-6 mb-16">
          <motion.div
            className="p-6 rounded-2xl border border-emerald-100 bg-emerald-50/50"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h3 className="text-xl font-bold text-gray-900 mb-3">{tx("Наша миссия")}</h3>
            <p className="text-gray-600 leading-relaxed text-sm">
               {tx("Сделать процесс покупки и продажи недвижимости в Таджикистане максимально прозрачным, безопасным и комфортным для каждого клиента. Мы верим, что каждая семья заслуживает идеальный дом.")} </p>
          </motion.div>
          <motion.div
            className="p-6 rounded-2xl border border-gray-100 bg-gray-50"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
          >
            <h3 className="text-xl font-bold text-gray-900 mb-3">{tx("Наши ценности")}</h3>
            <ul className="space-y-2 text-sm text-gray-600">
              {VALUES.map(v => (
                <li key={v} className="flex items-start gap-2"><Check className="w-4 h-4 text-emerald-700 flex-shrink-0 mt-0.5" /><span>{tx(v)}</span></li>
              ))}
            </ul>
          </motion.div>
        </div>

        {/* Why us */}
        <motion.div className="mb-16" initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
          <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">{tx("Почему выбирают Royal Home?")}</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {WHY_US.map((item, i) => (
              <div key={i} className="p-5 rounded-2xl bg-gray-50 border border-gray-100">
                <div className="flex items-center gap-2 mb-2">
                  <Check className="w-5 h-5 text-emerald-700" />
                  <h4 className="font-bold text-gray-900">{tx(item.title)}</h4>
                </div>
                <p className="text-sm text-gray-500">{tx(item.desc)}</p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* CTA */}
        <motion.div
          className="p-8 rounded-2xl text-center"
          style={{ background: 'linear-gradient(135deg, #1a4d3a, #0f2e22)' }}
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
        >
          <h3 className="text-xl font-bold text-white mb-2">{tx("Готовы найти свой дом?")}</h3>
          <p className="text-white/70 mb-6 max-w-xl mx-auto">{tx("Наша команда поможет вам на каждом этапе — от поиска до оформления документов.")}</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link to="/listings" className="px-6 py-3 rounded-xl bg-amber-400 text-gray-900 font-bold transition-all hover:bg-amber-300">{tx("Смотреть объекты")}</Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
