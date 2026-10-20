import { useEffect, useRef, useState, type ImgHTMLAttributes } from 'react';
import { useBrowserCapability } from '@/hooks/useBrowserCapability';

/** Unlike native lazy loading, respects a carousel's clipped offscreen slides. */
export default function DeferredImage({ src, srcSet, ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  const ref = useRef<HTMLImageElement>(null);
  const [seen, setSeen] = useState(false);
  const fallback = useBrowserCapability(() => typeof IntersectionObserver === 'undefined');
  const visible = seen || fallback;
  useEffect(() => {
    const element = ref.current;
    if (!element || visible || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      setSeen(true);
      observer.disconnect();
    }, { rootMargin: '200px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, [visible]);
  return <img {...props} ref={ref} src={visible ? src : undefined} srcSet={visible ? srcSet : undefined} decoding="async" />;
}
