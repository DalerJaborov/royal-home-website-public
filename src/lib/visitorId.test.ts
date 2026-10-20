import { afterEach, describe, expect, it, vi } from 'vitest';
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
describe('anonymous visitor identity with restricted storage', () => {
  it('keeps one valid in-memory UUID when access to localStorage itself throws', async () => {
    vi.stubGlobal('localStorage', undefined);
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new DOMException('Storage blocked', 'SecurityError'); } });
    const { getVisitorId } = await import('./visitorId');
    const first = getVisitorId();
    expect(first).toMatch(/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i);
    expect(getVisitorId()).toBe(first);
  });
  it('keeps the same UUID when writing is refused and reuses a valid existing browser ID', async () => {
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => { throw new DOMException('Full', 'QuotaExceededError'); } });
    const { getVisitorId } = await import('./visitorId');
    expect(getVisitorId()).toBe(getVisitorId());
    const saved = '9c0a0d70-4c88-4aab-8db0-730d7e26ea3c';
    vi.stubGlobal('localStorage', { getItem: () => saved, setItem: vi.fn() });
    expect(getVisitorId()).toBe(saved);
  });
});
