interface FactsSource {
  category?: string; floor?: string | null; totalFloors?: number | null;
  repair?: string | null; stage?: string | null; type?: string | null;
}
/** Same verified facts for the visible page and its initial crawlable HTML. */
export function listingFactRows(source: FactsSource) {
  if (source.category === 'LAND') return [];
  const house = source.category === 'HOUSE';
  const rows = [
    { label: 'Тип', value: house ? null : source.type },
    { label: 'Этаж', value: house ? null : source.floor },
    { label: 'Этажей в доме', value: house && source.totalFloors ? String(source.totalFloors) : null },
    { label: 'Ремонт', value: source.repair },
    { label: 'Стадия', value: house ? null : source.stage },
  ];
  return rows.filter((row): row is { label: string; value: string } => typeof row.value === 'string' && row.value.trim() !== '');
}
