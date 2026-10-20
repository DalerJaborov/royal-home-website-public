import { useLocale } from '@/hooks/useLocale';
import { X, Share, PlusSquare } from 'lucide-react';

/**
 * Fallback "how to install" instructions shown when there's no native
 * beforeinstallprompt to trigger (iOS Safari never fires one; some
 * browsers/sessions don't offer it yet either). Shared by every install
 * entry point so the guidance — and the icon — stays consistent.
 */
export default function PwaInstallHelpModal({ platform, onClose }: { platform: 'ios' | 'android' | 'other'; onClose: () => void }) {
  const { text: tx } = useLocale();
  return (
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <img src="/pwa-icon-192.png" alt="" className="w-12 h-12 rounded-2xl" />
          <button
            type="button"
            aria-label={tx("Закрыть")}
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
          >
            <X className="w-5 h-5 text-gray-700" />
          </button>
        </div>
        <h3 className="text-lg font-extrabold text-gray-900 mb-1">{tx("Установите ROYAL HOME")}</h3>
        <p className="text-sm text-gray-500 mb-5">
           {tx("Значок появится на рабочем столе — сайт будет открываться как настоящее приложение, без браузера.")} </p>
        {platform === 'ios' ? (
          <ol className="space-y-3 text-sm text-gray-700">
            <li className="flex items-center gap-3">
              <span className="w-7 h-7 rounded-full bg-emerald-800/10 text-emerald-800 font-bold flex items-center justify-center flex-shrink-0">1</span>
              <span className="flex items-center gap-1.5">{tx("Нажмите")} <Share className="w-4 h-4 inline text-emerald-800" />  {tx("«Поделиться» внизу Safari")}</span>
            </li>
            <li className="flex items-center gap-3">
              <span className="w-7 h-7 rounded-full bg-emerald-800/10 text-emerald-800 font-bold flex items-center justify-center flex-shrink-0">2</span>
              <span className="flex items-center gap-1.5">{tx("Выберите")} <PlusSquare className="w-4 h-4 inline text-emerald-800" />  {tx("«На экран “Домой”»")}</span>
            </li>
            <li className="flex items-center gap-3">
              <span className="w-7 h-7 rounded-full bg-emerald-800/10 text-emerald-800 font-bold flex items-center justify-center flex-shrink-0">3</span>
              <span>{tx("Подтвердите — готово!")}</span>
            </li>
          </ol>
        ) : (
          <p className="text-sm text-gray-700">
             {tx("Откройте меню браузера (⋮) и выберите «Установить приложение» или «Добавить на главный экран».")} </p>
        )}
      </div>
    </div>
  );
}
