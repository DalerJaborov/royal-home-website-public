import type { ImgHTMLAttributes } from 'react';
import { toThumbUrl } from '@/lib/images';
import { toCardImageUrl } from '@contracts/image-urls';

/** Small CRM photos use their generated thumbnail, with an original fallback. */
export default function ThumbnailImage({ src, variant = 'thumbnail', ...props }: ImgHTMLAttributes<HTMLImageElement> & { src: string; variant?: 'thumbnail' | 'card' }) {
  return (
    <img
      {...props}
      src={variant === 'card' ? toCardImageUrl(src) : toThumbUrl(src)}
      loading={props.loading ?? 'lazy'}
      decoding="async"
      onError={(event) => {
        const image = event.currentTarget;
        if (image.dataset.fallback !== src) {
          image.dataset.fallback = src;
          image.src = src;
        }
        props.onError?.(event);
      }}
    />
  );
}
