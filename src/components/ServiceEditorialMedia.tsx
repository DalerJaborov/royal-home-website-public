import { Link } from '@/components/LocalizedLink';
import { useLocale } from '@/hooks/useLocale';
import { useListingsData } from '@/hooks/useListingsData';
import { listingTitle } from '@/lib/listingPresentation';
import ThumbnailImage from '@/components/ThumbnailImage';

/** Catalog imagery is atmosphere, not evidence that this service was delivered. */
export default function ServiceEditorialMedia({ index = 0, gallery = false, photoIndex = 0 }: { index?: number; gallery?: boolean; photoIndex?: number }) {
  const { text: tx, locale } = useLocale();
  const { listings } = useListingsData();
  const candidates = listings.filter(item => !item.sold && item.category === 'APARTMENT' && item.photos?.length);
  const listing = candidates[index % Math.max(1, candidates.length)];
  if (!listing) return <div className="aspect-[4/5] bg-[#1a4d3a] flex items-end p-8 text-white text-3xl font-semibold">ROYAL HOME</div>;
  return (
    <figure>
      <Link to={`/listing/${listing.id}`} className="block overflow-hidden bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#1a4d3a]">
        <img src={listing.photos![Math.min(photoIndex, listing.photos!.length - 1)]} alt={listingTitle(listing, locale, tx)} width="960" height="1200" decoding="async" className="aspect-[4/5] sm:aspect-[4/3] lg:aspect-[4/5] lg:max-h-[28rem] w-full object-cover" />
      </Link>
      <figcaption className="mt-3 text-sm leading-relaxed text-gray-600">
        <span className="block mb-1">{tx('Фото объекта из каталога')}</span>
        <Link to={`/listing/${listing.id}`} className="underline underline-offset-4 hover:text-[#1a4d3a]">{listingTitle(listing, locale, tx)}</Link>
      </figcaption>
      {gallery && <div className="grid grid-cols-3 gap-3 mt-5">
        {candidates.filter(item => item.id !== listing.id).slice(0, 3).map(item => <Link key={item.id} to={`/listing/${item.id}`} className="focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#1a4d3a]"><ThumbnailImage src={item.photos![0]} alt={listingTitle(item, locale, tx)} width="320" height="320" loading="lazy" className="aspect-square w-full object-cover" /></Link>)}
      </div>}
    </figure>
  );
}
