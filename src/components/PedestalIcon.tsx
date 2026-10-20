import type { LucideIcon } from 'lucide-react';

/** Single hero icon on a frosted-glass pedestal with a soft grounded shadow —
 * the "Liquid Glass" studio-render look (reference: one clean object on a
 * circular platform), built from CSS/SVG instead of a stock illustration so
 * it always matches the card's brand gradient regardless of color. */
export function PedestalIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <div className="relative w-32 h-32 lg:w-40 lg:h-40 flex items-center justify-center shrink-0">
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 w-20 h-5 lg:w-24 lg:h-6 rounded-full bg-black/25 blur-md" />
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 w-24 h-24 lg:w-28 lg:h-28 rounded-full bg-gradient-to-b from-white/35 to-white/5 backdrop-blur-md border border-white/40 shadow-[inset_0_1px_0_rgba(255,255,255,.5),0_8px_20px_rgba(0,0,0,.15)]" />
      <Icon
        className="relative w-14 h-14 lg:w-16 lg:h-16 text-white drop-shadow-[0_8px_16px_rgba(0,0,0,.25)] -translate-y-3"
        strokeWidth={1.5}
      />
    </div>
  );
}
