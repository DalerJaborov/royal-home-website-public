type StorageKind = 'local' | 'session';
const browserStorage = (kind: StorageKind) => kind === 'session' ? globalThis.sessionStorage : globalThis.localStorage;

/** Storage access itself can throw in restricted/private browsing. */
export const safeStorage = {
  getItem(kind: StorageKind, key: string): string | null {
    try { return browserStorage(kind)?.getItem(key) ?? null; } catch { return null; }
  },
  setItem(kind: StorageKind, key: string, value: string): boolean {
    try { const storage = browserStorage(kind); if (!storage) return false; storage.setItem(key, value); return true; } catch { return false; }
  },
  removeItem(kind: StorageKind, key: string): void {
    try { browserStorage(kind)?.removeItem(key); } catch { /* Optional measurement never blocks a form. */ }
  },
};
