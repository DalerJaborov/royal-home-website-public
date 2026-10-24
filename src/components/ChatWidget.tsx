import { useLocale } from '@/hooks/useLocale';
import { lazy, Suspense, useCallback, useMemo, useState } from 'react';
import { MessageCircle, X } from 'lucide-react';

const ChatPanel = lazy(() => import('./ChatPanel'));
const SESSION_KEY = 'rh_chat_session';

/** Идентификатор сессии: тот же формат, что проверяют сайт-роутер и CRM. */
function loadSessionId(): string {
  try {
    const saved = localStorage.getItem(SESSION_KEY);
    if (saved && /^[a-zA-Z0-9_-]{16,64}$/.test(saved)) return saved;
    const bytes = new Uint8Array(18);
    crypto.getRandomValues(bytes);
    const fresh = btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, '').slice(0, 24);
    localStorage.setItem(SESSION_KEY, fresh);
    return fresh;
  } catch {
    // Приватный режим без localStorage: разговор живёт до перезагрузки страницы.
    // Это хуже, чем с памятью, но лучше, чем неработающий чат.
    return Math.random().toString(36).slice(2).padEnd(16, '0').slice(0, 24);
  }
}

export default function ChatWidget() {
  const { text: tx } = useLocale();
  const [open, setOpen] = useState(false);
  // Однажды правда — навсегда правда: не откатывается обратно на false. Панель
  // монтируется по этому флагу, а не по `open`, — ровно один раз за визит.
  const [everOpened, setEverOpened] = useState(false);
  const [tab, setTab] = useState<'chat' | 'callback'>('chat');
  const sessionId = useMemo(() => loadSessionId(), []);

  const openChat = useCallback(() => {
    setEverOpened(true);
    setOpen(true);
  }, []);

  return (
    <>
      {everOpened && (
        <Suspense fallback={open ? <div role="status" className="fixed bottom-40 right-4 z-[75] rounded-2xl border border-gray-100 bg-white p-5 text-sm shadow-xl">{tx("Загружаем чат…")}</div> : null}>
        <ChatPanel
          sessionId={sessionId}
          tab={tab}
          onTab={setTab}
          open={open}
          onClose={() => setOpen(false)}
        />
        </Suspense>
      )}

      {/* Пузырь поверх мобильной навигации: она занимает низ экрана (MobileNav),
          поэтому на телефоне кнопка поднята, а на десктопе стоит в самом углу.
          Тень нейтральная, не зелёная: цветной свет вокруг кнопки на фоне
          зелёной же шапки читался как техническая накладка, а не оформление. */}
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openChat())}
        aria-label={open ? tx("Свернуть чат") : tx("Открыть чат с консультантом")}
        aria-expanded={open}
        className="fixed bottom-24 right-4 z-[70] lg:bottom-6 lg:right-6 grid h-14 w-14 place-items-center rounded-full bg-emerald-600 text-white shadow-[0_10px_28px_-6px_rgba(0,0,0,0.35)] transition-transform hover:scale-105 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-600/30 active:scale-95"
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>
    </>
  );
}
