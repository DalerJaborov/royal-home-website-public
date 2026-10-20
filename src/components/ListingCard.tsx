import { listingTitle, listingLocation, listingDescription } from '@/lib/listingPresentation';
import { useLocale } from '@/hooks/useLocale';
import { Link } from '@/components/LocalizedLink';
import { Heart, MapPin, BedDouble, Square, Building2 } from 'lucide-react';
import { useFavorites } from '@/contexts/FavoritesContext';
import { pricePerMeter, formatPrice, type Listing } from '@/data/listings';
import CardPhotoCarousel from '@/components/CardPhotoCarousel';
// Photo carousel — shared component (hover-scrub on PC, swipe on mobile)
function CardImageCarousel({ photos, title, priority }: { photos?: string[]; title?: string; priority?: boolean }) {
  return (
    <CardPhotoCarousel photos={photos} alt={title} priority={priority} />
  );
}

export default function ListingCard({ listing, priority = false }: { listing: Listing; priority?: boolean }) {
  const { text: tx, locale } = useLocale();
  const { favorites, toggleFav } = useFavorites();
  const isFav = favorites.includes(listing.id);
  const ppm = pricePerMeter(listing.price, listing.area);

  return (
    <Link to={`/listing/${listing.id}`} className="bg-white rounded-2xl overflow-hidden border border-gray-100 hover:shadow-lg transition-all hover:-translate-y-1 block relative">
      <div className="relative aspect-[16/10] overflow-hidden bg-gray-100">
        <CardImageCarousel photos={listing.photos} title={listingTitle(listing, locale, tx)} priority={priority} />
        <div className="absolute top-3 left-3 flex gap-1.5 z-10">
          {listing.sold ? (
            <span className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-gray-800 text-white uppercase">{tx("Продано")}</span>
          ) : (
            <>
              {listing.urgent && <span className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-red-500 text-white uppercase">{tx("Срочная")}</span>}
              <span className="px-2.5 py-1 rounded-md text-[11px] font-bold text-white" style={{ backgroundColor: '#1a4d3a' }}>{tx("Продаётся")}</span>
            </>
          )}
        </div>
        <button
          onClick={(e) => { e.preventDefault(); toggleFav(listing.id); }}
          aria-label={isFav ? tx("Убрать из избранного") : tx("Добавить в избранное")}
          aria-pressed={isFav}
          className={`absolute top-3 right-3 z-10 w-8 h-8 rounded-full flex items-center justify-center shadow-md transition-all ${isFav ? 'bg-red-500 text-white' : 'bg-white/90 text-gray-500'}`}
        >
          <Heart className={`w-3.5 h-3.5 ${isFav ? 'fill-white' : ''}`} />
        </button>
      </div>
      <div className="p-4">
        <div className="flex items-baseline gap-2 mb-1">
          <span className="text-xl font-extrabold text-emerald-800">{tx(formatPrice(listing.price))}</span>
          <span className="text-xs text-gray-500">{tx(ppm.toLocaleString('ru-RU'))}  {tx("с./м²")}</span>
        </div>
        <h2 className="text-sm font-bold text-gray-900 mb-1.5 line-clamp-2">{listingTitle(listing, locale, tx)}</h2>
        <p className="text-xs text-gray-500 mb-3 flex items-center gap-1"><MapPin className="w-3 h-3" /> {listingLocation(listing, locale, tx)}</p>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500 mb-3 pb-3 border-b border-gray-100">
          <span className="flex items-center gap-1"><BedDouble className="w-3.5 h-3.5" /> {listing.rooms}{tx("-ком")}</span>
          <span className="flex items-center gap-1"><Square className="w-3.5 h-3.5" /> {listing.area}  {tx("м²")}</span>
          {listing.floor && <span className="flex items-center gap-1"><Building2 className="w-3.5 h-3.5" /> {tx(listing.floor)}</span>}
        </div>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {listing.type && <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-emerald-50 text-emerald-800">{tx(listing.type)}</span>}
          {listing.stage && <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-gray-100 text-gray-600">{tx(listing.stage)}</span>}
          {listing.repair && <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-blue-50 text-blue-700">{tx(listing.repair)}</span>}
        </div>
        <div className="flex items-center pt-2 border-t border-gray-100">
          <div className="text-[11px] text-gray-500">{tx(listing.date)}</div>
        </div>
        <p className="sr-only">{locale === 'ru' ? listing.seoDesc : listingDescription(listing, locale, tx)}</p>
      </div>
    </Link>
  );
}

