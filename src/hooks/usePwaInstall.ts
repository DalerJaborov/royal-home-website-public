import { useState, useEffect, useCallback } from 'react';
import { useBrowserCapability } from './useBrowserCapability';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// Chrome fires beforeinstallprompt once per page load; stash it at module
// level so the hook works no matter when the component mounts.
let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    listeners.forEach((fn) => fn());
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    listeners.forEach((fn) => fn());
  });
}

const isStandalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari
    (navigator as unknown as { standalone?: boolean }).standalone === true);

const isIos = () =>
  typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);

const isAndroid = () =>
  typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);

/**
 * Install-as-app state. `install()` opens the native "Установить приложение?"
 * prompt when the browser offers one; iOS Safari has no such API, so callers
 * should show add-to-home-screen instructions when `platform === 'ios'`.
 */
export function usePwaInstall() {
  const ios = useBrowserCapability(isIos);
  const android = useBrowserCapability(isAndroid);
  const [canPrompt, setCanPrompt] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const update = () => {
      setCanPrompt(!!deferredPrompt);
      setInstalled(isStandalone());
    };
    listeners.add(update);
    update();
    return () => { listeners.delete(update); };
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt) return false;
    // Chrome only honours prompt() once per captured event — calling it again
    // after a "dismissed" outcome throws (already-used gesture), which used to
    // go unhandled here and make a second tap on the button look completely
    // dead. Always drop the stale reference afterwards, accepted or not, so a
    // fresh beforeinstallprompt (or the help-modal fallback) is used instead.
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      return choice.outcome === 'accepted';
    } catch {
      return false;
    } finally {
      deferredPrompt = null;
      listeners.forEach((fn) => fn());
    }
  }, []);

  return {
    install,
    canPrompt,
    installed,
    platform: ios ? ('ios' as const) : android ? ('android' as const) : ('other' as const),
  };
}
