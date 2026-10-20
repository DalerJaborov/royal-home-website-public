import { districtCopy } from '@contracts/district-copy';
import { districtCollectionJsonLd } from '@contracts/district-schema';
import { useParams, useSearchParams } from 'react-router-dom';
import { catalogNeedsNoindex } from '@contracts/catalog-seo';
import { districtFromPath, districtListings, districtStats, DISTRICT_PAGES } from '@contracts/district-catalog';
import { useLocale } from '@/hooks/useLocale';
import { useListingsData } from '@/hooks/useListingsData';
import { useSeo } from '@/hooks/useSeo';
import { Link } from '@/components/LocalizedLink';
import ListingCard from '@/components/ListingCard';
import NotFound from './NotFound';

export default function DistrictCatalogPage() {
  const { slug } = useParams(), { locale } = useLocale();
  const [search] = useSearchParams();
  const district = districtFromPath(`/kvartiry/${slug}`);
  const { listings, isLoading, isError } = useListingsData();
  const rows = district ? districtListings(listings, district) : [];
  const copy = district ? districtCopy(district, locale) : null;
  const stats = districtStats(rows);
  useSeo({ title: copy?.title ?? 'ROYAL HOME', description: copy?.description,
    jsonLd: district ? districtCollectionJsonLd(district, locale, rows) : undefined,
    path: `/kvartiry/${slug}`, noindex: !district || isError || (!isLoading && !rows.length) || catalogNeedsNoindex(search), pending: isLoading });
  if (!district || !copy) return <NotFound />;
  const number = (value: number | null) => value == null ? '—' : value.toLocaleString(locale === 'tg' ? 'tg-TJ' : locale === 'en' ? 'en-US' : 'ru-RU');
  const metrics = [
    [copy.count, String(stats.count)], [copy.range, `${number(stats.min)}–${number(stats.max)} ${copy.currency}`],
    [copy.median, `${number(stats.median)} ${copy.currency}`], [copy.perMeter, `${number(stats.medianPerMeter)} ${copy.currency}`],
    [copy.rooms, stats.rooms.join(', ')], ...(stats.updatedAt ? [[copy.updated, stats.updatedAt]] : []),
  ];
  return <div className="pt-24 pb-12 bg-gray-50 min-h-screen"><div className="section-padding">
    <nav className="text-sm text-emerald-800 mb-5"><Link to="/listings">{copy.catalog}</Link></nav>
    <h1 className="text-3xl lg:text-4xl font-bold text-gray-900 max-w-3xl">{copy.heading}</h1>
    <p className="text-gray-600 max-w-3xl mt-5 leading-relaxed">{copy.intro}</p>
    <section className="my-8 rounded-2xl border border-gray-200 bg-white p-5 lg:p-7" aria-busy={isLoading}>
      <h2 className="text-xl font-bold text-gray-900 mb-5">{copy.stats}</h2>
      {stats.count > 0 && !isError && <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">{metrics.map(([label, value]) => <div key={label}><dt className="text-xs text-gray-500 mb-1">{label}</dt><dd className="font-semibold text-gray-900">{value}</dd></div>)}</dl>}
      {isError && <p role="alert">{{ ru: 'Не удалось загрузить предложения. Обновите страницу или свяжитесь с агентством.', tg: 'Пешниҳодҳоро бор карда натавонистем. Саҳифаро нав кунед ё бо агентӣ тамос гиред.', en: 'Unable to load offers. Refresh the page or contact the agency.' }[locale]}</p>}
      <p className="text-sm text-gray-500 leading-relaxed mt-5">{copy.method}</p>
    </section>
    <section><h2 className="text-2xl font-bold text-gray-900 mb-5">{copy.listings}</h2>
      {!isLoading && !isError && !rows.length && <p className="text-gray-600">{copy.empty}</p>}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">{rows.map((listing, index) => <ListingCard key={listing.id} listing={listing} priority={index === 0} />)}</div>
    </section>
    <section className="my-10 max-w-3xl"><h2 className="text-2xl font-bold text-gray-900 mb-5">{copy.checklist}</h2><ol className="list-decimal pl-5 space-y-4 text-gray-600 leading-relaxed">{copy.steps.map(step => <li key={step}>{step}</li>)}</ol></section>
    <div className="flex flex-wrap gap-3"><Link to="/contacts" className="btn-royal rounded-xl px-5 py-3">{copy.contacts}</Link><Link to="/listings" className="rounded-xl border border-gray-300 px-5 py-3 text-gray-800">{copy.catalog}</Link></div>
    <nav aria-label={copy.compare} className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-3 text-sm"><span className="text-gray-500">{copy.compare}: </span>{DISTRICT_PAGES.filter(d => d.slug !== district.slug).map(d => <Link key={d.slug} to={`/kvartiry/${d.slug}`} className="py-2 text-emerald-800 underline underline-offset-4">{d.names[locale]}</Link>)}</nav>
  </div></div>;
}
