/** Optional means an older sender did not supply the fact; null explicitly clears it. */
export interface CrmListingFacts {
  floor?: string | null;
  totalFloors?: number | null;
  repair?: string | null;
  stage?: string | null;
  type?: 'Новостройки' | 'Вторичка' | null;
  urgent?: boolean;
}

/** The v1 complete repair snapshot omits market type when the CRM has no
 * confirmed value. Partial patches and legacy publishers preserve omission. */
export function completeCrmRepairFacts(source: CrmListingFacts): CrmListingFacts {
  const complete = ['floor', 'totalFloors', 'repair', 'stage', 'urgent'].every(key => Object.hasOwn(source, key));
  return complete && source.type === undefined ? { ...source, type: null } : source;
}

export function pickCrmListingFacts(source: CrmListingFacts): CrmListingFacts {
  const result: CrmListingFacts = {};
  for (const key of ['floor', 'totalFloors', 'repair', 'stage', 'type', 'urgent'] as const) {
    if (source[key] !== undefined) Object.assign(result, { [key]: source[key] });
  }
  return result;
}
