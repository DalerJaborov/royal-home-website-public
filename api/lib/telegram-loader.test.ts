import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const source = readFileSync(new URL('../../public/telegram-webapp-loader.js', import.meta.url), 'utf8');

function run(hash: string, webApp?: Record<string, unknown>) {
  const scripts: Record<string, unknown>[] = [];
  const window = { location: { hash }, Telegram: webApp ? { WebApp: webApp } : undefined };
  runInNewContext(source, {
    window, URLSearchParams,
    document: {
      createElement: () => ({}),
      head: { appendChild: (script: Record<string, unknown>) => scripts.push(script) },
    },
  });
  return { window, scripts };
}

describe('Telegram Mini App SDK loading', () => {
  it('does not request the SDK for ordinary visitors or unrelated hashes', () => {
    for (const hash of ['', '#contacts', '#campaign=telegram']) expect(run(hash).scripts).toHaveLength(0);
  });

  it('loads asynchronously inside Telegram and initializes after SDK arrives', () => {
    const state = run('#tgWebAppVersion=8.0&tgWebAppData=user%3Dexample');
    expect(state.scripts).toHaveLength(1);
    expect(state.scripts[0]).toMatchObject({ src: 'https://telegram.org/js/telegram-web-app.js', async: true });
    const ready = vi.fn();
    const expand = vi.fn();
    state.window.Telegram = { WebApp: { ready, expand } };
    (state.scripts[0].onload as () => void)();
    expect(ready).toHaveBeenCalledOnce();
    expect(expand).toHaveBeenCalledOnce();
  });

  it('uses an already loaded SDK without adding a second script', () => {
    const ready = vi.fn();
    const expand = vi.fn();
    const setHeaderColor = vi.fn();
    expect(run('', { ready, expand, setHeaderColor }).scripts).toHaveLength(0);
    expect(ready).toHaveBeenCalledOnce();
    expect(expand).toHaveBeenCalledOnce();
    expect(setHeaderColor).toHaveBeenCalledWith('#1a4d3a');
  });
});
