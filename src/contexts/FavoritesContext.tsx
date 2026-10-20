import { createContext, useContext, useState, useEffect, startTransition, type ReactNode } from 'react';
import { trpc } from '@/providers/trpc';
import { useAdminAuth } from './AdminAuthContext';
import { getVisitorId } from '@/hooks/useAnalytics';
import { safeStorage } from '@/lib/safeStorage';
import { prepareMetaEvent } from '@/lib/metaPixel';

interface FavoritesContextType {
  favorites: number[];
  toggleFav: (id: number) => void;
  isFav: (id: number) => boolean;
}

const FavoritesContext = createContext<FavoritesContextType>({
  favorites: [],
  toggleFav: () => {},
  isFav: () => false,
});

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const [favorites, setFavorites] = useState<number[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let restored: number[] = [];
    try {
      const value: unknown = JSON.parse(safeStorage.getItem('local', 'royalhome_favorites') ?? '[]');
      if (Array.isArray(value)) restored = [...new Set(value.filter((id): id is number => Number.isSafeInteger(id) && id > 0))];
    } catch { /* Corrupt/blocked optional storage never prevents page rendering. */ }
    startTransition(() => { setFavorites(restored); setLoaded(true); });
  }, []);

  useEffect(() => {
    if (loaded) safeStorage.setItem('local', 'royalhome_favorites', JSON.stringify(favorites));
  }, [favorites, loaded]);

  // CRM-воронка покупателя (see api/analytics-router.ts analytics.event) —
  // считаем только ДОБАВЛЕНИЕ в избранное, не удаление: интерес к объекту, а
  // не «передумал». AdminAuthProvider специально вынесен наружу
  // FavoritesProvider в main.tsx, иначе useAdminAuth() здесь видел бы только
  // значение по умолчанию (isLoading: true), а не настоящий статус.
  const trackEvent = trpc.analytics.event.useMutation();
  const { isAdmin, isLoading } = useAdminAuth();

  const toggleFav = (id: number) => {
    // Замер факта «добавили» — ДО setFavorites, а не внутри его updater-функции:
    // React StrictMode в деве вызывает updater дважды ради поиска побочных
    // эффектов, и вызов trackEvent.mutate() внутри неё удвоил бы событие.
    const wasAdded = !favorites.includes(id);
    if (wasAdded && !isLoading && !isAdmin) {
      // favorite -> Meta InitiateCheckout (saved a listing): same event id in browser and Conversions API.
      const meta = prepareMetaEvent();
      trackEvent.mutate({ listingId: id, kind: 'favorite', visitorId: getVisitorId(), metaEventId: meta.metaEventId }, { onSuccess: (data) => meta.replay(data.metaEvents) });
    }
    setFavorites(prev => {
      const exists = prev.includes(id);
      return exists ? prev.filter(x => x !== id) : [...prev, id];
    });
  };

  const isFav = (id: number) => favorites.includes(id);

  return (
    <FavoritesContext.Provider value={{ favorites, toggleFav, isFav }}>
      {children}
    </FavoritesContext.Provider>
  );
}

// Provider and its hooks intentionally share the same context instance.
// eslint-disable-next-line react-refresh/only-export-components
export function useFavorites() {
  return useContext(FavoritesContext);
}

// Convenience hook for components that just need toggle + check
// eslint-disable-next-line react-refresh/only-export-components
export function useFavoriteToggle() {
  const { toggleFav, isFav } = useFavorites();
  return { toggleFav, isFav };
}
