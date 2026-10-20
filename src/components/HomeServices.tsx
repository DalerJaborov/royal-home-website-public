import { ArrowRight } from 'lucide-react';
import { Link } from '@/components/LocalizedLink';
import { ServiceGrid, ServiceHero } from '@/components/ServiceDesign';
import { useCms } from '@/contexts/CmsContext';
import { useLocale } from '@/hooks/useLocale';
import { SERVICES } from '@/data/services';

export function HomeServices() {
  const { cms } = useCms();
  const { text: tx } = useLocale();
  const items = cms.services.filter(item=>item.active).map(item=>{
    const service=SERVICES.find(value=>value.title===item.title);
    return {title:item.title,desc:item.desc===service?.shortDesc ? undefined : item.desc,image:item.image,slug:service?.slug || ''};
  });
  return <section className="royal-services service-home-section"><div className="service-body">
    <div className="service-section-heading"><h2 className="service-display">{tx('Наши услуги')}</h2><Link to="/services">{tx('Все услуги')}</Link></div>
    <ServiceGrid items={items}/><p className="service-media-note">{tx('Изображения услуг — иллюстрации.')}</p>
  </div></section>;
}

export function HomeServicePromotions() {
  const { cms } = useCms();
  const { text: tx } = useLocale();
  const promos=[
    {title:cms.banners.newBuildingsTitle,desc:cms.banners.newBuildingsDesc,to:'/listings?tab=new'},
    {title:cms.banners.mortgageTitle,desc:cms.banners.mortgageDesc,to:'/mortgage'},
    {title:cms.banners.evaluationTitle,desc:cms.banners.evaluationDesc,to:'/sell'},
  ];
  return <section className="royal-services service-home-section"><div className="service-body">
    <ServiceHero heading="h2" title="Новая жизнь вашей квартиры" subtitle="Ремонт, интерьер и уборка — выберите нужную услугу." to="/services" action="Посмотреть услуги" brand/>
    <div className="service-home-promos">{promos.map(item=><Link key={item.to} to={item.to} className="service-small-promo"><h3 className="service-display">{tx(item.title)}</h3><p>{tx(item.desc)}</p><span className="service-card-link">{tx('Подробнее')}<ArrowRight aria-hidden="true" size={18}/></span></Link>)}</div>
  </div></section>;
}
