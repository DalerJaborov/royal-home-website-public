import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const app = vi.hoisted(() => ({ started: vi.fn(), acquisition: vi.fn() }));
vi.mock('./lib/acquisitionAttribution', () => ({ recordAcquisitionVisit: app.acquisition }));
let paint: (list: { getEntries(): Array<{ name: string }> }) => void;
let ready: () => void;
let documentTarget: EventTarget;
let ssr = true;
let catalogPage = false;
let rootTarget: { addEventListener: ReturnType<typeof vi.fn>; removeEventListener: ReturnType<typeof vi.fn>; querySelector: ReturnType<typeof vi.fn>; contains: ReturnType<typeof vi.fn> };
let menuClick: ReturnType<typeof vi.fn>;
let assign: ReturnType<typeof vi.fn>;
let frames: FrameRequestCallback[];

beforeEach(() => {
  vi.resetModules();
  vi.doMock('./main', () => { app.started(); return {}; });
  vi.useFakeTimers();
  app.started.mockClear();
  app.acquisition.mockClear();
  ssr = true;
  catalogPage = false;
  documentTarget = new EventTarget();
  menuClick = vi.fn();
  assign = vi.fn();
  frames = [];
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.push(callback); return frames.length; });
  rootTarget = {
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
    querySelector: vi.fn(selector => selector === '[data-public-catalog]' ? (catalogPage ? {} : null) : selector.startsWith('button[') ? { click: menuClick } : null), contains: vi.fn(() => true),
  };
  const fonts = { ready: new Promise<void>(resolve => { ready = resolve; }) };
  Object.assign(documentTarget, {
    fonts,
    documentElement: { lang: 'ru' },
    referrer: 'https://www.google.com/',
    getElementById: () => Object.assign(rootTarget, { dataset: { publicSsr: ssr ? 'true' : undefined } }),
  });
  vi.stubGlobal('document', documentTarget);
  vi.stubGlobal('window', { location: { assign, pathname: '/tg', search: '?utm_source=google' } });
  vi.stubGlobal('PerformanceObserver', class {
    static supportedEntryTypes = ['paint'];
    constructor(callback: typeof paint) { paint = callback; }
    observe() {}
    disconnect() {}
  });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
const firstPaint = () => paint({ getEntries: () => [{ name: 'first-contentful-paint' }] });

it('gives complete SSR page fonts bandwidth and a paint, then starts the application once', async () => {
  await import('./entry-client');
  firstPaint();
  await vi.dynamicImportSettled();
  expect(app.started).not.toHaveBeenCalled();
  ready();
  await vi.dynamicImportSettled();
  expect(app.started).not.toHaveBeenCalled();
  frames.shift()!(0);
  await vi.dynamicImportSettled();
  expect(app.started).not.toHaveBeenCalled();
  frames.shift()!(16);
  await vi.dynamicImportSettled();
  expect(app.started).toHaveBeenCalledTimes(1);
  documentTarget.dispatchEvent(new Event('pointerdown'));
  await vi.advanceTimersByTimeAsync(4000);
  expect(app.started).toHaveBeenCalledTimes(1);
});
it.each(['pointerdown', 'keydown'])('starts immediately on %s while fonts are pending', async event => {
  await import('./entry-client');
  firstPaint();
  documentTarget.dispatchEvent(new Event(event));
  await vi.dynamicImportSettled();
  expect(app.started).toHaveBeenCalledTimes(1);
  ready();
  await vi.dynamicImportSettled();
  expect(app.started).toHaveBeenCalledTimes(1);
});
it('keeps the existing deadline if a font never finishes', async () => {
  await import('./entry-client');
  firstPaint();
  await vi.advanceTimersByTimeAsync(4000);
  await vi.dynamicImportSettled();
  expect(app.started).toHaveBeenCalledTimes(1);
});
it('keeps first-paint initialization when the font API is unavailable', async () => {
  Object.assign(documentTarget, { fonts: undefined });
  await import('./entry-client');
  firstPaint();
  await vi.dynamicImportSettled();
  expect(app.started).toHaveBeenCalledTimes(1);
});
it.each(['tg','en'])('retains first-paint catalogue startup for %s', async lang => {
  catalogPage = true;
  Object.assign(documentTarget, { documentElement: { lang } });
  await import('./entry-client');
  firstPaint();
  await vi.dynamicImportSettled();
  expect(app.started).toHaveBeenCalledTimes(1);
});
it('retains font-paint startup on a non-Russian home page', async () => {
  Object.assign(documentTarget, { documentElement: { lang: 'tg' } });
  rootTarget.querySelector.mockReturnValue({});
  await import('./entry-client');
  firstPaint();
  await vi.dynamicImportSettled();
  expect(app.started).not.toHaveBeenCalled();
  ready();
  await vi.dynamicImportSettled();
  frames.shift()!(0);frames.shift()!(16);
  await vi.dynamicImportSettled();
  expect(app.started).toHaveBeenCalledTimes(1);
});
it('preserves the first catalogue sort click and replays the original node once', async () => {
  catalogPage = true;
  await import('./entry-client');
  const handler = rootTarget.addEventListener.mock.calls.find(([type]) => type === 'click')![1];
  const click = vi.fn();
  const control = { dataset: { publicCatalogAction: 'sort' }, isConnected: true, click, closest: (selector: string) => selector === '[data-public-catalog]' ? {} : null };
  const event = { target: { closest: () => control }, preventDefault: vi.fn(), stopImmediatePropagation: vi.fn() };
  handler(event);
  await vi.dynamicImportSettled();
  expect(app.started).toHaveBeenCalledTimes(1);
  expect(click).not.toHaveBeenCalled();
  documentTarget.dispatchEvent(new Event('royalhome:interactive'));
  expect(click).not.toHaveBeenCalled();
  expect(rootTarget.removeEventListener).not.toHaveBeenCalled();
  documentTarget.dispatchEvent(new Event('royalhome:catalog-interactive'));
  expect(click).not.toHaveBeenCalled();
  frames.shift()!(16);
  documentTarget.dispatchEvent(new Event('royalhome:interactive'));
  documentTarget.dispatchEvent(new Event('royalhome:catalog-interactive'));
  expect(click).toHaveBeenCalledTimes(1);
  expect(rootTarget.contains).toHaveBeenCalledWith(control);
});
it('preserves a sort action when hydration replaces its server node', async () => {
  catalogPage = true;
  await import('./entry-client');
  const handler = rootTarget.addEventListener.mock.calls.find(([type]) => type === 'click')![1];
  const replaced = { dataset: { publicCatalogAction: 'sort' }, isConnected: false, closest: (selector: string) => selector === '[data-public-catalog]' ? {} : null };
  handler({ target: { closest: () => replaced }, preventDefault: vi.fn(), stopImmediatePropagation: vi.fn() });
  const click = vi.fn();
  rootTarget.querySelector.mockReturnValue({ click });
  documentTarget.dispatchEvent(new Event('royalhome:catalog-interactive'));
  frames.shift()!(16);
  expect(rootTarget.querySelector).toHaveBeenLastCalledWith('[data-public-catalog] button[data-public-catalog-action="sort"]');
  expect(click).toHaveBeenCalledTimes(1);
});
it('does not capture a property control or a lead-form button', async () => {
  catalogPage = true;
  await import('./entry-client');
  const handler = rootTarget.addEventListener.mock.calls.find(([type]) => type === 'click')![1];
  const click = vi.fn();
  const removed = { dataset: {}, isConnected: false, click, closest: (selector: string) => selector === '[data-public-catalog]' ? {} : null };
  const stop = vi.fn();
  handler({ target: { closest: () => removed }, preventDefault: stop, stopImmediatePropagation: stop });
  const form = { dataset: { publicCatalogAction: 'filters' }, closest: () => ({}) };
  handler({ target: { closest: () => form }, preventDefault: stop, stopImmediatePropagation: stop });
  expect(stop).not.toHaveBeenCalled();
  documentTarget.dispatchEvent(new Event('royalhome:catalog-interactive'));
  expect(frames).toHaveLength(0);
  expect(click).not.toHaveBeenCalled();
});
it('preserves native category navigation while a catalogue boundary is still hydrating', async () => {
  catalogPage = true;
  await import('./entry-client');
  const handler = rootTarget.addEventListener.mock.calls.find(([type]) => type === 'click')![1];
  const destination = '/tg/khonaho-dushanbe?category=HOUSE&utm_source=google';
  const link = { getAttribute: () => destination, closest: () => ({}) };
  const event = { button: 0, target: { closest: (selector: string) => selector === 'button' ? null : link }, preventDefault: vi.fn(), stopImmediatePropagation: vi.fn() };
  handler(event);
  expect(assign).toHaveBeenCalledWith(destination);
  expect(app.acquisition).toHaveBeenCalledWith('/tg', '?utm_source=google', 'https://www.google.com/');
  expect(event.preventDefault).toHaveBeenCalledTimes(1);
  assign.mockClear();
  handler({ ...event, ctrlKey: true });
  expect(assign).not.toHaveBeenCalled();
  documentTarget.dispatchEvent(new Event('royalhome:catalog-interactive'));
  handler(event);
  expect(assign).not.toHaveBeenCalled();
});
it('starts SPA fallbacks without waiting for paint or fonts', async () => {
  ssr = false;
  await import('./entry-client');
  await vi.dynamicImportSettled();
  expect(app.started).toHaveBeenCalledTimes(1);
});
it('preserves the first menu click and replays it once after hydration', async () => {
  await import('./entry-client');
  const handler = rootTarget.addEventListener.mock.calls.find(([type]) => type === 'click')![1];
  const event = { target: { closest: () => ({ dataset: { publicAction: 'menu' } }) }, preventDefault: vi.fn(), stopImmediatePropagation: vi.fn() };
  handler(event);
  handler(event);
  await vi.dynamicImportSettled();
  expect(app.started).toHaveBeenCalledTimes(1);
  expect(menuClick).not.toHaveBeenCalled();
  documentTarget.dispatchEvent(new Event('royalhome:interactive'));
  documentTarget.dispatchEvent(new Event('royalhome:interactive'));
  expect(menuClick).toHaveBeenCalledTimes(1);
  expect(rootTarget.removeEventListener).toHaveBeenCalledWith('click', handler, true);
});
it('navigates early search from native values and preserves acquisition before leaving', async () => {
  await import('./entry-client');
  const handler = rootTarget.addEventListener.mock.calls.find(([type]) => type === 'click')![1];
  const values: Record<string, string> = { category: 'APARTMENT', district: 'Сино', rooms: '2' };
  const container = { querySelector: (selector: string) => ({ value: values[selector.match(/="([^"]+)"/)![1]] }) };
  const control = { dataset: { publicAction: 'search', publicSearchPath: '/tg/khonaho-dushanbe' }, closest: () => container };
  handler({ target: { closest: () => control }, preventDefault: vi.fn(), stopImmediatePropagation: vi.fn() });
  expect(assign).toHaveBeenCalledWith('/tg/khonaho-dushanbe?category=APARTMENT&district=%D0%A1%D0%B8%D0%BD%D0%BE&rooms=2');
  expect(app.acquisition).toHaveBeenCalledWith('/tg', '?utm_source=google', 'https://www.google.com/');
  expect(app.acquisition.mock.invocationCallOrder[0]).toBeLessThan(assign.mock.invocationCallOrder[0]);
});
