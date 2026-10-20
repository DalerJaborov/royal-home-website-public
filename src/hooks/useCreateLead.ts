import { useCallback } from 'react';
import type { inferRouterInputs } from '@trpc/server';
import { trpc } from '@/providers/trpc';
import type { AppRouter } from '../../api/router';
import { getVisitorId } from '@/lib/visitorId';
import { getActiveListingId, prepareMetaEvent } from '@/lib/metaPixel';

type LeadInput = inferRouterInputs<AppRouter>['lead']['create'];

/** `trpc.lead.create.useMutation()` plus Meta tracking: the form passes the usual fields and this adds the
 * event id (browser Lead/Purchase + Conversions API deduplicate on it), the listing page the visitor is on,
 * and replays the events after a successful submit. Same return shape as the plain mutation. */
export function useCreateLead() {
  const mutation = trpc.lead.create.useMutation();
  const { mutateAsync } = mutation;
  const create = useCallback(async (input: Omit<LeadInput, 'metaEventId' | 'listingId' | 'visitorId'>) => {
    const meta = prepareMetaEvent();
    const result = await mutateAsync({ ...input, metaEventId: meta.metaEventId, listingId: getActiveListingId(), visitorId: getVisitorId() });
    meta.replay('metaEvents' in result ? result.metaEvents : undefined);
    return result;
  }, [mutateAsync]);
  return { ...mutation, mutateAsync: create };
}
