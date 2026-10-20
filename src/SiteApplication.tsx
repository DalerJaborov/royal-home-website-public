import type { QueryClient } from '@tanstack/react-query';
import type { PublicLocaleDictionary } from '@contracts/public-i18n';
import { TRPCProvider } from './providers/trpc';
import { AdminAuthProvider } from './contexts/AdminAuthContext';
import { FavoritesProvider } from './contexts/FavoritesContext';
import { MobileMenuProvider } from './contexts/MobileMenuContext';
import App from './App';
import { useEffect } from 'react';
import { PUBLIC_INTERACTIVE_EVENT } from './lib/homeSearch';

/** Identical public provider tree for server HTML and browser hydration. */
export default function SiteApplication({ queryClient, dictionary }: { queryClient?: QueryClient; dictionary?: PublicLocaleDictionary }) {
  useEffect(() => { document.dispatchEvent(new Event(PUBLIC_INTERACTIVE_EVENT)); }, []);
  return <TRPCProvider queryClientOverride={queryClient}><AdminAuthProvider><FavoritesProvider><MobileMenuProvider>
    <App serverDictionary={dictionary} />
  </MobileMenuProvider></FavoritesProvider></AdminAuthProvider></TRPCProvider>;
}
