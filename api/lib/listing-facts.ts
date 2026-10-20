import { listingFactRows } from '@contracts/listing-facts';
const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export function listingFactsHtml(source: Parameters<typeof listingFactRows>[0], translate = (value: string) => value) {
  const rows = listingFactRows(source).map(row => ({ label: translate(row.label), value: translate(row.value) || (/^[\d/.-]+$/.test(row.value) ? row.value : '') }));
  return `<dl>${rows.filter(row => row.label && row.value).map(row => `<dt>${escape(row.label)}</dt><dd>${escape(row.value)}</dd>`).join('')}</dl>`;
}
