import type { To } from 'react-router-dom';

/** Only site routes receive a prefix; query strings, fragments and external URLs survive. */
export function localizeTo(to: To, path: (value: string) => string): To {
  if (typeof to === 'string') return to.startsWith('/') && !to.startsWith('//') ? path(to) : to;
  return to.pathname?.startsWith('/') ? { ...to, pathname: path(to.pathname) } : to;
}
