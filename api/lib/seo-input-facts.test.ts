import {describe,expect,it} from 'vitest';
import {buildListingSeoMeta,buildListingSeoMetaTj} from './seo';
describe('unknown market type in generated property copy',()=>{
  it('does not substitute new-build or nearby infrastructure for missing facts',()=>{
    const source={title:'Квартира',location:'Сино, Душанбе',price:800000,rooms:2,area:60};
    expect(buildListingSeoMeta(source).metaDescription).not.toContain('новостройка');
    const tg=buildListingSeoMetaTj(source);
    expect(tg.metaDescriptionTj).not.toContain('навсохт');
    expect(tg.descriptionTj).not.toContain('мактабҳо');
    expect(buildListingSeoMeta({...source,type:'Новостройки'}).metaDescription).toContain('новостройка');
    expect(buildListingSeoMeta({...source,type:'Новостройки',category:'HOUSE'}).metaDescription).not.toContain('новостройка');
  });
});
