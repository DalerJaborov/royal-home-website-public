import { createContext, useContext, useState, type ReactNode } from 'react';

/**
 * Открытие мобильного меню — общее состояние между Header (сам рисует
 * выезжающую панель) и MobileNav (нижняя панель, кнопка «Меню» открывает
 * панель Header). Раньше `mobileOpen` был локальным `useState` внутри Header —
 * снаружи открыть панель было нечем, а с 23.08.2026 нижняя панель тоже должна
 * это уметь (вместо WhatsApp там теперь пункт «Меню», раз кнопка чата справа
 * внизу закрывает ту же задачу «быстро написать нам»).
 */
interface MobileMenuState {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const MobileMenuContext = createContext<MobileMenuState | null>(null);

export function MobileMenuProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <MobileMenuContext.Provider value={{ open, setOpen }}>{children}</MobileMenuContext.Provider>;
}

export function useMobileMenu(): MobileMenuState {
  const ctx = useContext(MobileMenuContext);
  if (!ctx) throw new Error('useMobileMenu must be used within MobileMenuProvider');
  return ctx;
}
