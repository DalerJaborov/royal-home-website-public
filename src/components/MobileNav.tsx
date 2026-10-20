import { useLocale } from '@/hooks/useLocale';
import { useState, useEffect, useRef } from 'react';
import { Link } from '@/components/LocalizedLink';
import { Home, Search, Heart, Menu } from 'lucide-react';
import { useFavorites } from '../contexts/FavoritesContext';
import { useMobileMenu } from '../contexts/MobileMenuContext';

/**
 * Кнопка WhatsApp заменена на «Меню» (23.08.2026, решение владельца): написать
 * нам теперь можно чат-виджетом в правом нижнем углу (ChatWidget.tsx) — держать
 * WhatsApp здесь стало избыточно, а полноценного пункта меню в нижней панели не
 * было вовсе. Открывает ту же выезжающую панель, что и «гамбургер» в шапке
 * (Header.tsx) — общее состояние в MobileMenuContext.
 */
export default function MobileNav() {
  const { text: tx, basePath } = useLocale();
  const { favorites } = useFavorites();
  const favCount = favorites.length;
  const { setOpen: openMenu } = useMobileMenu();

  const [visible, setVisible] = useState(true);
  const lastScrollY = useRef(0);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      if (currentScrollY > 100 && currentScrollY > lastScrollY.current) {
        setVisible(false);
      } else if (currentScrollY < lastScrollY.current) {
        setVisible(true);
      }
      lastScrollY.current = currentScrollY;
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const items = [
    { key: '/', label: 'Главная', icon: Home, type: 'link' as const },
    { key: '/listings', label: 'Найти', icon: Search, type: 'link' as const },
    { key: '/favorites', label: 'Избранное', icon: Heart, type: 'link' as const },
    { key: 'menu', label: 'Меню', icon: Menu, type: 'action' as const },
  ];

  return (
    <nav className={`fixed bottom-4 left-8 right-8 z-50 lg:hidden transition-transform duration-300 ease-out ${visible ? 'translate-y-0' : 'translate-y-[100px]'}`}>
      <div className="glass-nav-bar relative flex items-end justify-around rounded-full py-2 px-4">
        {items.map((item) => {
          const isActive = item.type === 'link' && (basePath === item.key || (item.key !== '/' && basePath.startsWith(item.key)));

          if (item.type === 'action') {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => openMenu(true)}
                data-public-action="menu"
                aria-label={tx("Открыть меню")}
                className="relative z-10 flex flex-col items-center justify-center gap-1 flex-1 py-1.5 px-1 rounded-xl transition-colors text-gray-500 hover:text-emerald-700"
              >
                <Icon className="w-5 h-5" strokeWidth={2} />
                <span className="text-[10px] font-medium">{tx(item.label)}</span>
              </button>
            );
          }
          return (
            <Link
              key={item.key}
              to={item.key}
              className={`relative z-10 flex flex-col items-center justify-center gap-1 flex-1 py-1.5 px-1 rounded-2xl transition-colors ${isActive ? 'glass-nav-active text-white' : 'text-gray-500'}`}
            >
              <span className="relative">
                <item.icon className={`w-5 h-5 ${isActive ? 'stroke-[2.5]' : 'stroke-2'}`} />
                {item.key === '/favorites' && favCount > 0 && (
                  <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center px-1">
                    {favCount}
                  </span>
                )}
              </span>
              <span className="text-[10px] font-medium">{tx(item.label)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
