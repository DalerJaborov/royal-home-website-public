import { useLocale } from '@/hooks/useLocale';
import { useState, useEffect } from 'react';
import { X, Download } from 'lucide-react';
import { usePwaInstall } from '@/hooks/usePwaInstall';
import PwaInstallHelpModal from './PwaInstallHelpModal';

const DISMISS_KEY = 'pwa-prompt-dismissed-until';
const DISMISS_DAYS = 7;

function isDismissed(): boolean {
  try {
    const until = localStorage.getItem(DISMISS_KEY);
    if (!until) return false;
    return Date.now() < parseInt(until, 10);
  } catch { return false; }
}

function setDismissed() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_DAYS * 24 * 60 * 60 * 1000));
  } catch { /* noop */ }
}

/**
 * Soft install suggestion: slides up a card offering to put the ROYAL HOME
 * icon on the home screen. "Установить" opens the browser's native prompt.
 * Dismissing hides it for a week. Mobile-only; never shown inside the
 * installed app.
 */
export default function PwaInstallPrompt() {
  const { text: tx } = useLocale();
  const { install, canPrompt, installed, platform } = usePwaInstall();
  const [visible, setVisible] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  // A narrow desktop window (small browser, resized for testing, etc.) still
  // matches the lg:hidden breakpoint below — check actual touch capability
  // too, so this mobile-only prompt doesn't pop up on a shrunk desktop tab.
  const isTouchDevice = typeof window !== 'undefined' && (navigator.maxTouchPoints > 0 || 'ontouchstart' in window);

  useEffect(() => {
    if (installed || isDismissed() || !isTouchDevice) return;
    const timer = setTimeout(() => setVisible(true), 6000);
    return () => clearTimeout(timer);
  }, [installed, isTouchDevice]);

  if (installed || !isTouchDevice) return null;

  const handleInstall = async () => {
    // A native prompt isn't always available yet (iOS never offers one, and
    // Chrome only fires beforeinstallprompt once its own engagement
    // heuristics are met) — fall back to on-screen instructions instead of
    // silently doing nothing when that's the case.
    if (platform === 'ios' || !canPrompt) {
      // Найдено 23.08.2026 на живом телефоне: нижняя плашка не пряталась под
      // модалкой с инструкцией — закрыв «Установите ROYAL HOME», человек видел,
      // что плашка «Установить» как ни в чём не бывало осталась висеть внизу, и
      // это читалось как «кнопка закрытия не работает». Инструкцию уже показали,
      // держать плашку поверх/под ней незачем.
      setVisible(false);
      setShowHelp(true);
      return;
    }
    setVisible(false);
    await install();
  };

  const handleClose = () => {
    setVisible(false);
    setDismissed();
  };

  return (
    <>
      {/* animate-chat-in — тот же keyframe, что и у чат-виджета (ChatWidget.tsx):
          "slideUp" здесь никогда не был объявлен в tailwind.config.js, и Tailwind
          молча пропускает произвольное имя без keyframes — карточка появлялась
          без единой анимации. */}
      {visible && (
        <div className="fixed bottom-20 left-4 right-4 z-[60] lg:hidden animate-chat-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 p-4 flex items-center gap-3">
            <img src="/pwa-icon-192.png" alt="" className="w-12 h-12 rounded-xl flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="font-bold text-gray-900 text-sm">{tx("Установите приложение ROYAL HOME")}</div>
              <div className="text-xs text-gray-500">{tx("Значок на рабочем столе — квартиры всегда под рукой")}</div>
            </div>
            <button
              onClick={handleInstall}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-white text-sm font-semibold flex-shrink-0"
              style={{ backgroundColor: '#1a4d3a' }}
            >
              <Download className="w-4 h-4" />  {tx("Установить")} </button>
            <button
              onClick={handleClose}
              aria-label={tx("Закрыть")}
              className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 flex-shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
      {showHelp && <PwaInstallHelpModal platform={platform} onClose={() => setShowHelp(false)} />}
    </>
  );
}
