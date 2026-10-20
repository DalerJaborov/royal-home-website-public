import { StrictMode } from 'react';
import { prerenderToNodeStream } from 'react-dom/static';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient } from '@tanstack/react-query';
import { getQueryKey } from '@trpc/react-query';
import { trpc } from './providers/trpc';
import SiteApplication from './SiteApplication';
import type { PublicRenderInput } from '@contracts/public-render-input';
/** Per-request cache contains public data only. Never reuse it across visitors. */
export async function renderPublicApplication(input: PublicRenderInput): Promise<string> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  client.setQueryData(getQueryKey(trpc.cms.getAll, undefined, 'query'), input.cms);
  client.setQueryData(getQueryKey(trpc.listing.list, {}, 'query'), input.inventory);
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), 1500);
  try {
    let failure: unknown;
    const { prelude, postponed } = await prerenderToNodeStream(<StrictMode><MemoryRouter initialEntries={[input.path]}>
      <SiteApplication queryClient={client} dictionary={input.dictionary} />
    </MemoryRouter></StrictMode>, {
      signal: controller.signal,
      // This bounded fragment is sent complete, never as hidden client-reveal chunks.
      progressiveChunkSize: 512 * 1024,
      // The surrounding Hono document already emits its critical image hints.
      // Keep React's additional preload tags outside this hydrated fragment.
      onHeaders() {},
      onError(error) { failure = error; },
    });
    if (failure || postponed) throw failure ?? Error('Incomplete public render');
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of prelude) {
      const buffer = Buffer.from(chunk);
      size += buffer.length;
      if (size > 512 * 1024) throw Error('Public HTML exceeds limit');
      chunks.push(buffer);
    }
    // Responsive image hints cannot be sent through onHeaders. The Hono head
    // already emits them; leaving them before this fragment would change its root.
    return Buffer.concat(chunks).toString('utf8').replace(/^(?:<link\b(?=[^>]*\brel="(?:preload|preconnect)")[^>]*\/>)+/, '');
  } finally { clearTimeout(deadline); client.clear(); }
}
