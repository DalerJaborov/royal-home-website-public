export interface EnglishProperty {
  id: number; category?: string; rooms: number; area: number; price: number;
  location: string; sold?: boolean;
  /** CRM card number; the listing number is printed only when it exists. */
  crmShortId?: number | null;
}

/** Facts from the row, shared by the initial HTML and the client head. The
 * CRM card number identifies similar listings; without it no number is shown. */
export function englishPropertyMeta(row: EnglishProperty) {
  const district = /сино/i.test(row.location) ? 'Sino'
    : /фирдавс/i.test(row.location) ? 'Firdavsi'
    : /шохмансур/i.test(row.location) ? 'Shohmansur'
    : /сомони|исмоили/i.test(row.location) ? 'Ismoili Somoni' : '';
  const type = row.category === 'HOUSE' ? 'Detached house' : row.category === 'LAND' ? 'Land'
    : row.category === 'COMMERCIAL' ? 'Commercial property' : 'Apartment';
  const heading = `${type}${type === 'Apartment' || type === 'Detached house' ? `, ${row.rooms} rooms` : ''}, ${row.area} m² in ${district ? `${district}, ` : ''}Dushanbe`;
  const number = typeof row.crmShortId === 'number' && row.crmShortId > 0 ? row.crmShortId : undefined;
  return {
    heading,
    title: `${row.sold ? 'Sold: ' : ''}${heading}${number ? ` · Listing №${number}` : ''} | ROYAL HOME`,
    description: `${heading}.${number ? ` Listing №${number}.` : ''} Price: ${row.price.toLocaleString('en-US')} TJS. ${row.sold ? 'Archived sold listing.' : 'Contact ROYAL HOME for details and a viewing.'}`,
  };
}
