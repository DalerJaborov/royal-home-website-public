/** Only the public dropdown filters may become navigation parameters. */
export function homeSearchQuery(values: { category?: string; district?: string; rooms?: string }): string {
  const params = new URLSearchParams();
  if (['APARTMENT', 'HOUSE', 'COMMERCIAL', 'LAND'].includes(values.category ?? '')) params.set('category', values.category!);
  if (['Сино', 'Шохмансур', 'Фирдавси', 'И. Сомони'].includes(values.district ?? '')) params.set('district', values.district!);
  if (['1', '2', '3', '4+'].includes(values.rooms ?? '')) params.set('rooms', values.rooms!);
  return params.toString();
}

export function readHomeSearch(container: ParentNode | null): string {
  const value = (name: string) => container?.querySelector<HTMLSelectElement>(`select[data-home-filter="${name}"]`)?.value;
  return homeSearchQuery({ category: value('category'), district: value('district'), rooms: value('rooms') });
}

export const PUBLIC_INTERACTIVE_EVENT = 'royalhome:interactive';
export const PUBLIC_CATALOG_INTERACTIVE_EVENT = 'royalhome:catalog-interactive';
