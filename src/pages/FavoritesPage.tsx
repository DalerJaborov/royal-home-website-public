import { listingTitle, listingLocation, listingDescription } from '@/lib/listingPresentation';
import { useLocale } from '@/hooks/useLocale';
import { Link } from '@/components/LocalizedLink';
import { motion } from 'framer-motion';
import { Heart, MapPin, BedDouble, Square, Building2, ArrowLeft } from 'lucide-react';
import { useFavorites } from '../contexts/FavoritesContext';
import { objectsWord } from '../lib/plural';
import { pricePerMeter, formatPrice } from '../data/listings';
import { useListingsData } from '@/hooks/useListingsData';
import CardPhotoCarousel from '@/components/CardPhotoCarousel';
import { useSeo } from '../hooks/useSeo';
import { CORE_PAGE_SEO } from '@contracts/core-page-seo';

export default function FavoritesPage() {
  const { text: tx, locale } = useLocale();
  // Избранное — персональный список, для поиска ценности нет: title ставим, но
  // просим не индексировать.
  useSeo({ ...CORE_PAGE_SEO['/favorites'], noindex: true });
  const { favorites, toggleFav } = useFavorites();
  const { listings: LISTINGS, isLoading } = useListingsData();

  const favListings = LISTINGS.filter(l => favorites.includes(l.id));

  // Favourites come from localStorage (instant) but the catalogue loads over
  // the network. Without this guard the page flashes the "empty" state for a
  // frame before the listings arrive — the "flicker/refresh" on open.
  if (isLoading && LISTINGS.length === 0) {
    return <div className="pt-20 pb-16 min-h-screen bg-gray-50" />;
  }

  if (favListings.length === 0) {
    return (
      <div className="pt-20 pb-16 min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <Heart className="w-10 h-10 text-gray-300" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{tx("Избранное пусто")}</h1>
          <p className="text-gray-500 mb-6 max-w-sm mx-auto">
             {tx("Добавляйте понравившиеся квартиры в избранное, чтобы не потерять их")} </p>
          <Link
            to="/listings"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-white font-semibold"
            style={{ backgroundColor: '#1a4d3a' }}
          >
            <ArrowLeft className="w-4 h-4" />
             {tx("Смотреть объекты")} </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-20 pb-16 min-h-screen bg-gray-50">
      <div className="section-padding">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 mb-2">
             {tx("Избранное")} </h1>
          <p className="text-gray-500 mb-6">
            {favListings.length} {tx(objectsWord(favListings.length, locale))}
          </p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {favListings.map(listing => {
            const ppm = pricePerMeter(listing.price, listing.area);

            return (
              <motion.div
                key={listing.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-2xl overflow-hidden border border-gray-100 hover:shadow-lg transition-all hover:-translate-y-1"
              >
                <Link to={`/listing/${listing.id}`} className="block relative">
                  <div className="relative aspect-[16/10] overflow-hidden bg-gray-100">
                    <CardPhotoCarousel photos={listing.photos} alt={listingTitle(listing, locale, tx)} />
                    {listing.sold ? (
                      <span className="absolute top-3 left-3 px-2.5 py-1 rounded-md text-[11px] font-bold bg-gray-800 text-white uppercase z-10 pointer-events-none">
                         {tx("Продано")} </span>
                    ) : (
                      <span
                        className="absolute top-3 left-3 px-2.5 py-1 rounded-md text-[11px] font-bold text-white z-10 pointer-events-none"
                        style={{ backgroundColor: '#1a4d3a' }}
                      >
                         {tx("Продаётся")} </span>
                    )}
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        toggleFav(listing.id);
                      }}
                      aria-label={tx("Убрать из избранного")}
                      className="absolute top-3 right-3 w-8 h-8 rounded-full bg-red-500 flex items-center justify-center shadow-md transition-all hover:scale-110 z-20"
                    >
                      <Heart className="w-3.5 h-3.5 text-white fill-white" />
                    </button>
                  </div>
                </Link>
                <div className="p-4">
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-xl font-extrabold text-emerald-800">
                      {tx(formatPrice(listing.price))}
                    </span>
                    <span className="text-xs text-gray-400">
                      {tx(ppm.toLocaleString('ru-RU'))}  {tx("с./м²")} </span>
                  </div>
                  <h3 className="text-sm font-bold text-gray-900 mb-1.5 line-clamp-2">
                    {listingTitle(listing, locale, tx)}
                  </h3>
                  <p className="text-xs text-gray-500 mb-3 flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> {listingLocation(listing, locale, tx)}
                  </p>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500 mb-3 pb-3 border-b border-gray-100">
                    <span className="flex items-center gap-1">
                      <BedDouble className="w-3.5 h-3.5" /> {listing.rooms}{tx("-ком")} </span>
                    <span className="flex items-center gap-1">
                      <Square className="w-3.5 h-3.5" /> {listing.area}  {tx("м²")} </span>
                    <span className="flex items-center gap-1">
                      <Building2 className="w-3.5 h-3.5" /> {tx(listing.floor)}
                    </span>
                  </div>
                  <p className="sr-only">{locale === 'ru' ? listing.seoDesc : listingDescription(listing, locale, tx)}</p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
