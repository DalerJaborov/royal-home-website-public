import type { ReactNode } from 'react';
import { useLocale } from '@/hooks/useLocale';
import { VIDEO_COPY } from '@contracts/listing-video';

export function UnavailableListingVideo({ poster, children }: { poster?: string; children?: ReactNode }) {
  const { locale } = useLocale();
  return <div className="relative w-full h-full min-h-48 bg-emerald-950 rounded-2xl overflow-hidden">
    {poster && <img src={poster} alt="" className="block w-full h-full max-h-[70vh] object-contain" />}
    <div className="absolute inset-x-0 bottom-0 bg-black/80 text-white p-4 text-center">
      <p role="status">{VIDEO_COPY[locale].missing}</p>{children}
    </div>
  </div>;
}
