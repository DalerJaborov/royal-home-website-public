import { Link } from './LocalizedLink';
import { useLocale } from '@/hooks/useLocale';
import { DISTRICT_PAGES } from '@contracts/district-catalog';
export default function DistrictLinks({ dark = false }: { dark?: boolean }) {
  const { locale } = useLocale();
  const label = { ru: 'Квартиры по районам', tg: 'Хонаҳо аз рӯйи ноҳияҳо', en: 'Apartments by district' }[locale];
  return <nav aria-label={label} className="flex flex-wrap items-center gap-2 py-3 text-sm">
    <span className={dark ? 'text-gray-400' : 'text-gray-500'}>{label}:</span>
    {DISTRICT_PAGES.map(d => <Link key={d.slug} to={`/kvartiry/${d.slug}`} className={`rounded-lg border px-3 py-2 font-medium ${dark ? 'border-white/20 text-gray-200 hover:bg-white/10' : 'border-emerald-200 bg-white text-emerald-800 hover:bg-emerald-50'}`}>{d.names[locale]}</Link>)}
  </nav>;
}
