import { useLocale } from '@/hooks/useLocale';
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
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
  const [teaser, setTeaser] = useState(false);
  const sessionId = useMemo(() => loadSessionId(), []);

  // Первое появление — не сразу: всплывающее окно в лицо на первой секунде
  // раздражает и его закрывают не читая. Через полминуты человек уже осмотрелся.
  useEffect(() => {
    if (open || !window.matchMedia('(min-width: 1024px)').matches) return;
    let seen: string | null = null;
    try { seen = sessionStorage.getItem('rh_chat_teaser'); } catch { /* Storage can be disabled in private mode. */ }
    if (seen) return;
    const timer = setTimeout(() => {
      if (window.matchMedia('(min-width: 1024px)').matches) setTeaser(true);
    }, 30_000);
    return () => clearTimeout(timer);
  }, [open]);

  const dismissTeaser = useCallback(() => {
    setTeaser(false);
    try {
      sessionStorage.setItem('rh_chat_teaser', '1');
    } catch {
      // Приватный режим — подсказка появится ещё раз в следующей вкладке. Мелочь.
    }
  }, []);

  const openChat = useCallback(() => {
    dismissTeaser();
    setEverOpened(true);
    setOpen(true);
  }, [dismissTeaser]);

  return (
    <>
      {teaser && !open && (
        <div className="hidden lg:block fixed bottom-24 right-6 z-[70] max-w-[260px] animate-chat-teaser">
          <div className="relative rounded-2xl rounded-br-md bg-white px-4 py-3 shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-gray-100">
            <button
              type="button"
              onClick={dismissTeaser}
              aria-label={tx("Закрыть подсказку")}
              className="absolute -top-2 -right-2 grid h-6 w-6 place-items-center rounded-full bg-gray-900/80 text-white hover:bg-gray-900"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            <p className="text-[14px] leading-snug text-gray-700">
               {tx("Здравствуйте! Подобрать квартиру или узнать цену? Напишите — отвечу сразу.")} </p>
            <button type="button" onClick={openChat} className="mt-2 text-[13.5px] font-semibold text-emerald-700 hover:underline">
               {tx("Открыть чат")} </button>
          </div>
        </div>
      )}

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
