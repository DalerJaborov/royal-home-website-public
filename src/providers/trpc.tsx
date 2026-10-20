import { createTRPCReact, getQueryKey } from "@trpc/react-query";
import { httpBatchLink, splitLink } from "@trpc/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import superjson from "superjson";
import type { AppRouter } from "../../api/router";
import type { ReactNode } from "react";
import { consumeCatalogBootstrap, seedCatalogQuery, consumeListingBootstrap, seedListingQuery } from '@/lib/catalogBootstrap';
import { PUBLIC_RENDER_QUERIES } from '@contracts/public-render-queries';
import { CMS_BOOTSTRAP_ID, parseCmsBootstrap } from '@contracts/cms-bootstrap';

// eslint-disable-next-line react-refresh/only-export-components -- Shared typed tRPC hooks are intentionally exported with their provider.
export const trpc = createTRPCReact<AppRouter>();

const queryClient = new QueryClient();
if (typeof document !== 'undefined') {
  const element = document.getElementById(CMS_BOOTSTRAP_ID);
  if (element) {
    const cms = element.tagName === 'SCRIPT' && element.getAttribute('type') === 'application/json' ? parseCmsBootstrap(element.textContent ?? '') : undefined;
    element.remove();
    if (cms) queryClient.setQueryData(getQueryKey(trpc.cms.getAll, undefined, 'query'), cms.data, { updatedAt: cms.generatedAt });
  }
  const bootstrap = consumeCatalogBootstrap(document, window.location.pathname);
  if (bootstrap) seedCatalogQuery(queryClient, getQueryKey(trpc.listing.list, {}, 'query'), bootstrap);
  const listing = consumeListingBootstrap(document, window.location.pathname);
  if (listing) seedListingQuery(queryClient, getQueryKey(trpc.listing.getById, { id: listing.listing.id }, 'query'), listing);
}
function apiLink() {
  return httpBatchLink<AppRouter>({
      url: "/api/trpc",
      transformer: superjson,
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    });
}
const trpcClient = trpc.createClient({
  links: [splitLink({
    condition: operation => operation.type === 'query' && PUBLIC_RENDER_QUERIES.has(operation.path),
    true: apiLink(), false: apiLink(),
  })],
});

export function TRPCProvider({ children, queryClientOverride }: { children: ReactNode; queryClientOverride?: QueryClient }) {
  const client = queryClientOverride ?? queryClient;
  return (
    <trpc.Provider client={trpcClient} queryClient={client}>
      <QueryClientProvider client={client}>
        {children}
      </QueryClientProvider>
    </trpc.Provider>
  );
}
