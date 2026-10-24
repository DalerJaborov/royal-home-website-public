import { useParams } from 'react-router-dom';
import { Link } from '@/components/LocalizedLink';
import { useListingData } from '@/hooks/useListingsData';
import { useLocale } from '@/hooks/useLocale';
import { useSeo } from '@/hooks/useSeo';
import { useMetaListingView } from '@/hooks/useMetaPixel';
import { listingJsonLd } from '@contracts/listing-jsonld';
import { listingVideoContentUrl, listingVideoMeta, VIDEO_COPY } from '@contracts/listing-video';

export default function ListingVideoPage() {
  const { id } = useParams();
  const { locale, path } = useLocale();
  const { listing, isLoading, isNotFound } = useListingData(Number(id));
  const copy = VIDEO_COPY[locale];
  const meta = listing ? listingVideoMeta(listing, locale) : undefined;
  const poster = listing?.photos?.[0];
  const images = poster ? [new URL(poster, 'https://royalhome.tj').href] : [];
  const contentUrl = listingVideoContentUrl(Number(id));
  const video = listing && meta && listing.videoUrl ? listingJsonLd({ ...listing,
    sold: Boolean(listing.sold), title: meta.name, description: meta.description,
    images, url: meta.url, videoUrl: contentUrl, uploadDate: listing.createdAt }).video : undefined;
  // Same catalog item and browser/CAPI deduplication as the detail page. Viewing
  // this page is not a Lead, Purchase or a claim that the video was played.
  useMetaListingView(video && !isLoading && !isNotFound ? listing?.id : undefined);
  useSeo({ title: meta?.title ?? copy.missing, description: meta?.description,
    image: poster, path: `/listing/${id}/video`, pending: isLoading || (!listing && !isNotFound),
    noindex: isNotFound || (!isLoading && !video),
    jsonLd: meta && video ? { '@context': 'https://schema.org', '@type': 'WebPage',
      '@id': meta.url, url: meta.url, name: meta.title, description: meta.description, inLanguage: locale,
      mainEntity: { ...video, '@id': `${meta.url}#video`, url: meta.url,
        isPartOf: { '@type': 'WebPage', '@id': meta.url },
        about: { '@type': 'RealEstateListing', url: `https://royalhome.tj${path(`/listing/${id}`)}` } } } : null });
  if (isLoading) return <div className="pt-28 pb-24 px-4 text-center" role="status">{copy.loading}</div>;
  if (!listing || !meta || !video) return <div className="pt-28 pb-24 px-4 text-center"><h1 className="text-2xl font-bold">{copy.missing}</h1><Link to="/listings" className="underline inline-block my-6">{copy.catalog}</Link></div>;
  return <div className="mx-auto max-w-3xl px-4 pt-28 pb-24">
    <nav className="text-sm text-emerald-800" aria-label={copy.catalog}><Link to="/listings">{copy.catalog}</Link> · <Link to={`/listing/${listing.id}`}>{copy.back}</Link></nav>
    <h1 className="text-2xl font-bold mt-5 mb-2">{meta.heading}</h1>
    <p className="text-gray-600 mb-5">{meta.property}</p>
    <video key={contentUrl} controls playsInline preload="none" poster={poster} src={new URL(contentUrl).pathname} aria-label={meta.heading}
      className="block w-full max-h-[70vh] aspect-[4/3] bg-emerald-950 rounded-2xl object-contain" />
    {listing.sold && <p className="my-4 font-medium">{copy.sold}</p>}
    <p className="my-4 text-gray-600 leading-relaxed">{meta.description}</p>
    <Link className="inline-block underline my-4 text-emerald-800" to={`/listing/${listing.id}`}>{copy.back}</Link>
  </div>;
}
