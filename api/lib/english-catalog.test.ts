import { describe, expect, it } from 'vitest';
import { englishPropertyMeta } from '@contracts/english-catalog';

describe('English listing identity', () => {
  const row = { id: 101, crmShortId: 5101, category: 'APARTMENT', rooms: 2, area: 84, price: 800000, location: 'Сино, Душанбе', sold: false };
  it('distinguishes twins by the CRM card number and uses the actual district', () => {
    const first = englishPropertyMeta(row);
    const sameDistrict = englishPropertyMeta({...row,id:96,crmShortId:5096});
    const otherDistrict = englishPropertyMeta({...row,id:97,crmShortId:5097,location:'Шохмансур'});
    expect(new Set([first.title,sameDistrict.title,otherDistrict.title]).size).toBe(3);
    expect(new Set([first.description,sameDistrict.description,otherDistrict.description]).size).toBe(3);
    expect(first.title).toContain('Sino');
    expect(otherDistrict.title).toContain('Shohmansur');
    expect(first.title).toContain('Listing №5101');
    expect(first.title).not.toContain('№101 ');
  });
  it('uses factual categories and retains sold state without fabricating a district', () => {
    expect(englishPropertyMeta({...row,category:'LAND',location:'Душанбе',sold:true}).title).toBe('Sold: Land, 84 m² in Dushanbe · Listing №5101 | ROYAL HOME');
    expect(englishPropertyMeta({...row,location:'Фирдавси'}).heading).toContain('Firdavsi');
    expect(englishPropertyMeta({...row,location:'Исмоили Сомони'}).heading).toContain('Ismoili Somoni');
  });
  it('never prints the site row id when the CRM has not numbered the listing', () => {
    for (const crmShortId of [null, undefined]) {
      const meta = englishPropertyMeta({ ...row, crmShortId });
      expect(meta.title).toBe('Apartment, 2 rooms, 84 m² in Sino, Dushanbe | ROYAL HOME');
      expect(meta.description).not.toContain('№');
      expect(meta.description).not.toContain('101');
    }
  });
});
