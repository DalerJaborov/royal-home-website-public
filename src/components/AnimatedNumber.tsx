import { useEffect, useRef, useState } from 'react';

/**
 * Плавно «набирает» число от нуля до целевого (rAF, easeOutCubic) — живые счётчики
 * в админ-дашборде. Уважает prefers-reduced-motion (показывает финал сразу).
 * По умолчанию форматирует ru-разрядами; format можно переопределить.
 */
export function AnimatedNumber({
  value,
  format,
  duration = 900,
}: {
  value: number;
  format?: (n: number) => string;
  duration?: number;
}) {
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);
  const rafRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const reduce =
      typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const from = fromRef.current;
    const to = value;
    if (reduce || from === to) {
      setDisplay(to);
      fromRef.current = to;
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (to - from) * eased);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value, duration]);

  const rounded = Math.round(display);
  return <>{format ? format(rounded) : rounded.toLocaleString('ru-RU')}</>;
}
