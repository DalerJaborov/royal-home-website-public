import { useLocale } from '@/hooks/useLocale';
import { COMPANY_CONTACTS } from '@contracts/company-contacts';
import { type CSSProperties } from 'react';
import { Link } from '@/components/LocalizedLink';
import Reveal from '@/components/Reveal';
import { Home, Grid3x3, Phone, MessageCircle, ArrowRight } from 'lucide-react';
import { SERVICES } from '../data/services';
import { useSeo } from '../hooks/useSeo';

export default function NotFound() {
  const { text: tx } = useLocale();
  useSeo({ title: 'Страница не найдена | Royal Home', noindex: true });
  return (
    <div className="pt-24 pb-16 min-h-screen bg-white overflow-hidden">
      <div className="section-padding">
        <div className="max-w-5xl mx-auto grid lg:grid-cols-2 gap-8 items-center mb-16">
          {/* Big soft numerals + copy */}
          <div className="anim-reveal-up">
            <div
              className="text-7xl sm:text-8xl font-black leading-none mb-4 bg-clip-text text-transparent"
              style={{ backgroundImage: 'linear-gradient(135deg, #1a4d3a 0%, #6bbf9a 100%)' }}
            >
              404
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3">{tx("Страница не найдена")}</h1>
            <p className="text-gray-500 mb-6 max-w-sm">
               {tx("Кажется, вы заблудились. Страница, которую вы ищете, не существует или была перемещена.")} </p>
            <div className="flex flex-wrap items-center gap-3">
              <Link to="/" className="btn-royal inline-flex items-center gap-2 px-6 py-3 rounded-2xl font-semibold text-sm">
                 {tx("Вернуться на главную")} <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                to="/listings"
                aria-label={tx("Каталог объектов")}
                className="w-12 h-12 rounded-2xl bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-700 hover:bg-gray-200 transition-colors"
              >
                <Grid3x3 className="w-5 h-5" />
              </Link>
            </div>
          </div>

          {/* Glass illustration — soft blurred brand blobs + a floating glass house */}
          <div
            className="relative h-64 sm:h-80 flex items-center justify-center anim-reveal-scale"
            style={{ animationDelay: '0.1s' }}
          >
            <div
              aria-hidden
              className="absolute w-72 h-72 sm:w-96 sm:h-96 rounded-full"
              style={{ background: 'radial-gradient(circle, rgba(26,77,58,0.12), transparent 70%)', filter: 'blur(4px)' }}
            />
            <div
              aria-hidden
              className="absolute w-52 h-52 rounded-full -translate-x-16 translate-y-10"
              style={{ background: 'radial-gradient(circle, rgba(246,196,83,0.16), transparent 70%)', filter: 'blur(8px)' }}
            />
            <div className="glass-icon-tile glass-icon-tile--emerald relative w-40 h-40 sm:w-48 sm:h-48 rounded-[2.5rem]">
              <Home className="relative z-10 w-16 h-16 sm:w-20 sm:h-20 text-[#1a4d3a]" strokeWidth={1.5} />
            </div>
            {/* Small floating badges around the house, like the reference's signposts */}
            <div
              className="absolute top-2 right-4 sm:right-10 glass-icon-tile glass-icon-tile--gold w-14 h-14 rounded-2xl anim-float"
            >
              <MessageCircle className="relative z-10 w-6 h-6 text-[#1a4d3a]" />
            </div>
            <div
              className="absolute bottom-4 left-2 sm:left-8 glass-icon-tile glass-icon-tile--emerald w-14 h-14 rounded-2xl anim-float"
              style={{ '--float-dist': '8px', animationDuration: '3.4s', animationDelay: '0.4s' } as CSSProperties}
            >
              <Grid3x3 className="relative z-10 w-6 h-6 text-[#1a4d3a]" />
            </div>
          </div>
        </div>

        {/* Возможно, вы искали — reuse the same services catalogue */}
        <div className="max-w-5xl mx-auto mb-12">
          <h2 className="text-sm font-bold uppercase tracking-wide text-gray-400 mb-4">{tx("Возможно, вы искали:")}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {SERVICES.map((s, i) => (
              <Reveal
                key={s.slug}
                y={16}
                delay={i * 0.05}
              >
                <Link
                  to={`/services/${s.slug}`}
                  className="group flex flex-col h-full p-4 rounded-2xl bg-gray-50 border border-gray-100 hover:shadow-md hover:-translate-y-0.5 transition-all"
                >
                  <div className={`glass-icon-tile ${i % 2 === 0 ? 'glass-icon-tile--emerald' : 'glass-icon-tile--gold'} w-10 h-10 rounded-xl mb-3`}>
                    <s.icon className="relative z-10 w-4.5 h-4.5 text-[#1a4d3a]" />
                  </div>
                  <div className="text-sm font-bold text-gray-900 mb-1">{tx(s.title)}</div>
                  <div className="text-xs text-gray-500 leading-snug line-clamp-2">{tx(s.shortDesc)}</div>
                  <ArrowRight className="w-3.5 h-3.5 text-gray-300 mt-auto pt-2 group-hover:text-emerald-700 transition-colors" />
                </Link>
              </Reveal>
            ))}
          </div>
        </div>

        {/* Help strip */}
        <Reveal
          className="max-w-5xl mx-auto rounded-3xl bg-gray-50 border border-gray-100 p-6 flex flex-col sm:flex-row sm:items-center gap-5 sm:gap-8"
          y={16}
        >
          <div className="flex-1">
            <div className="text-base font-bold text-gray-900 mb-1">{tx("Нужна помощь?")}</div>
            <div className="text-sm text-gray-500">{tx("Мы всегда на связи и готовы помочь вам найти то, что нужно")}</div>
          </div>
          <a href={COMPANY_CONTACTS.callHref} className="flex items-center gap-3">
            <div className="glass-icon-tile glass-icon-tile--emerald w-11 h-11 rounded-xl flex-shrink-0">
              <Phone className="relative z-10 w-4.5 h-4.5 text-[#1a4d3a]" />
            </div>
            <div>
              <div className="text-sm font-bold text-gray-900">{tx(COMPANY_CONTACTS.callDisplay)}</div>
              <div className="text-xs text-gray-400">{tx("Позвоните нам")}</div>
            </div>
          </a>
          <Link to="/contacts" className="flex items-center gap-3">
            <div className="glass-icon-tile glass-icon-tile--gold w-11 h-11 rounded-xl flex-shrink-0">
              <MessageCircle className="relative z-10 w-4.5 h-4.5 text-[#1a4d3a]" />
            </div>
            <div>
              <div className="text-sm font-bold text-gray-900">{tx("Напишите нам")}</div>
              <div className="text-xs text-gray-400">{tx("Ответим в чате")}</div>
            </div>
          </Link>
        </Reveal>
      </div>
    </div>
  );
}
