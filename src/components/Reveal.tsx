import { useEffect, useRef, useState, type CSSProperties, type ElementType, type ReactNode } from 'react';

type RevealProps = {
  /** Tag to render — 'div' (default), 'h2', 'a', … */
  as?: ElementType;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** Initial x offset in px (negative = slides in from the left). */
  x?: number;
  /** Initial y offset in px (positive = slides up into place). */
  y?: number;
  /** Entrance delay in seconds — used to stagger a mapped list. */
  delay?: number;
  /** Add a subtle scale-up on hover once revealed (banner cards). */
  hoverScale?: boolean;
  /** Extra attributes forwarded to the tag (href, onClick, target, …). */
  [key: string]: unknown;
};

/**
 * IntersectionObserver-based entrance reveal — a ~zero-dependency stand-in for
 * framer-motion's `whileInView` fade/slide. Used on the eagerly-loaded home and
 * 404 paths so framer-motion stays out of the initial bundle (it was the single
 * biggest slice of the entry chunk). Heavier framer usage on lazy pages is fine —
 * those chunks only download on navigation.
 *
 * Initial content is visible in server HTML and during hydration. Only elements
 * confirmed outside the viewport are armed for a later entrance animation.
 * Reduced motion and missing IntersectionObserver remain fully visible.
 */
export default function Reveal({
  as: Tag = 'div',
  children,
  className = '',
  style,
  x = 0,
  y = 24,
  delay = 0,
  hoverScale = false,
  ...rest
}: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);
  // Server and browser start from identical, readable markup.
  const [shown, setShown] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          io.disconnect();
        } else setShown(false);
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const cls = ['reveal', hoverScale && 'reveal-hover', shown && 'is-visible', className]
    .filter(Boolean)
    .join(' ');

  const revealStyle: CSSProperties = {
    '--reveal-x': `${x}px`,
    '--reveal-y': `${y}px`,
    // Keep the stagger delay only while entering; drop it once shown so any
    // hover transition on the same element stays snappy.
    transitionDelay: !shown && delay ? `${delay}s` : undefined,
    ...style,
  } as CSSProperties;

  return (
    <Tag ref={ref as never} className={cls} style={revealStyle} {...rest}>
      {children}
    </Tag>
  );
}
