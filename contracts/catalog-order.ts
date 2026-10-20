/** Public default order: active objects first, newest identity first within each group. */
export function compareCatalogOrder(a: { id: number; sold?: boolean }, b: { id: number; sold?: boolean }): number {
  return Number(Boolean(a.sold)) - Number(Boolean(b.sold)) || b.id - a.id;
}
