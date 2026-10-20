import { useState } from 'react';
import { useLocale } from '@/hooks/useLocale';
import { usePwaInstall } from '@/hooks/usePwaInstall';
import PwaInstallHelpModal from './PwaInstallHelpModal';

// Installation is offered through the browser on every platform.
const DOWNLOAD_ICON = (
  <path d="M12 3v12m0 0l-4-4m4 4l4-4M5 19h14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
);

/**
 * Optional installation button in the menu/footer.
 * Tapping it triggers the browser's native install prompt when offered;
 * otherwise it shows short, platform-specific add-to-home-screen instructions.
 */
export default function AppInstallButtons({ compact = false, variant = 'light' }: { compact?: boolean; variant?: 'light' | 'dark' }) {
  const { text: tx } = useLocale();
  const { install, canPrompt, installed, platform } = usePwaInstall();
  const [showHelp, setShowHelp] = useState(false);

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (installed) return;
    if (platform === 'ios' || !canPrompt) {
      setShowHelp(true);
      return;
    }
    await install();
  };

  const isDark = variant === 'dark';
  const badgeCls = `flex items-center rounded-xl transition-colors overflow-hidden w-full ${
    isDark ? 'bg-white/10 hover:bg-white/15' : 'bg-gray-100 hover:bg-gray-200'
  } ${compact ? 'gap-2 px-2.5 py-2' : 'gap-3 px-4 py-2.5'}`;
  const iconCls = `flex-shrink-0 ${isDark ? 'text-white/80' : 'text-gray-700'} ${compact ? 'w-4 h-4' : 'w-6 h-6'}`;
  const eyebrowCls = `block text-[9px] leading-none whitespace-nowrap ${isDark ? 'text-white/50' : 'text-gray-500'}`;
  const labelCls = `block font-semibold leading-tight whitespace-nowrap ${isDark ? 'text-white' : 'text-gray-900'} ${compact ? 'text-[11px]' : 'text-sm'}`;

  const icon = DOWNLOAD_ICON;
  const eyebrow = installed ? tx('Установлено') : tx('Установить');
  const label = installed ? 'ROYAL HOME' : platform === 'other' ? tx('как приложение') : tx('на телефон');

  return (
    <>
      <div className={compact ? 'flex' : 'flex flex-col'}>
        <button type="button" aria-label={`${eyebrow} ${label}${installed ? '' : ' ROYAL HOME'}`} onClick={handleClick} className={badgeCls}>
          <svg aria-hidden="true" className={iconCls} viewBox="0 0 24 24" fill="currentColor">{icon}</svg>
          <span className="text-left min-w-0">
            <span className={eyebrowCls}>{eyebrow}</span>{' '}
            <span className={labelCls}>{label}</span>
          </span>
        </button>
      </div>

      {/* iOS / Android-without-prompt fallback: how to add to home screen */}
      {showHelp && <PwaInstallHelpModal platform={platform} onClose={() => setShowHelp(false)} />}
    </>
  );
}
