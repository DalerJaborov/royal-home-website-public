import { safeStorage } from './safeStorage';
const VISITOR_ID_KEY = 'rh_visitor_id';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let memoryVisitorId: string | undefined;

/** Anonymous measurement ID; neither PII nor an authentication credential. */
export function getVisitorId(): string {
  const saved = safeStorage.getItem('local', VISITOR_ID_KEY);
  if (saved && uuid.test(saved)) { memoryVisitorId = saved; return saved; }
  if (!memoryVisitorId) {
    try { memoryVisitorId = globalThis.crypto?.randomUUID?.(); } catch { /* Fall back for browsers without randomUUID. */ }
    memoryVisitorId ??= 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, character => {
      const random = Math.floor(Math.random() * 16);
      return (character === 'x' ? random : (random & 3) | 8).toString(16);
    });
  }
  safeStorage.setItem('local', VISITOR_ID_KEY, memoryVisitorId);
  return memoryVisitorId;
}
