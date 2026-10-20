import { useLocale } from '@/hooks/useLocale';
import { ServiceHero, ServiceGrid, ServiceCallout } from '@/components/ServiceDesign';
import { SERVICES } from '@/data/services';
import { useCms } from '@/contexts/CmsContext';
import { useDocumentSeo } from '@/hooks/useDocumentSeo';
import type { Translations } from '@/data/translations';

export default function ServicesPage({ t: _t }: { t: Translations }) {
  const { text: tx } = useLocale();
  const { cms } = useCms();
  useDocumentSeo(cms.site.pageSeo.services.title, cms.site.pageSeo.services.description);
  const items = SERVICES.map(service => {
    const item = cms.services.find(value => value.title === service.title);
    return { ...service, image: item?.image, desc: item?.desc && item.desc !== service.shortDesc ? item.desc : undefined };
  });
  return <div className="royal-services service-index">
    <ServiceHero title="Услуги для вашего дома" subtitle="Продажа, ремонт и обустройство — выберите вашу задачу." />
    <div className="service-body">
      <div className="service-section-heading"><h2 className="service-display">{tx('Выберите услугу')}</h2></div>
      <ServiceGrid items={items}/>
      <p className="service-media-note">{tx('Изображения услуг — иллюстрации.')}</p>
      <ServiceCallout/>
    </div>
  </div>;
}
