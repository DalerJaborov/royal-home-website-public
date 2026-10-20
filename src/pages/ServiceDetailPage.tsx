import { useLocale } from '@/hooks/useLocale';
import { COMPANY_CONTACTS } from '@contracts/company-contacts';
import { useParams } from 'react-router-dom';
import { Link } from '@/components/LocalizedLink';
import { ServiceHero, ServiceGrid } from '@/components/ServiceDesign';
import { Phone, ChevronLeft, Plus } from 'lucide-react';
import { SERVICES, SERVICE_FAQ } from '@/data/services';
import { useSeo } from '@/hooks/useSeo';
import { findServiceSeo } from '@contracts/services-seo';

export default function ServiceDetailPage() {
  const { text: tx } = useLocale();
  const { slug } = useParams();
  const service = SERVICES.find(item => item.slug === slug);
  const seo = slug ? findServiceSeo(slug) : undefined;
  useSeo({ title: seo?.metaTitle || 'Услуга не найдена | ROYAL HOME', description: seo?.metaDesc, noindex: !service });
  if (!service) return <div className="section-padding pt-32 pb-24"><h1>{tx('Услуга не найдена')}</h1><Link to="/services">{tx('← Все услуги')}</Link></div>;
  return <div className="royal-services service-detail">
    <ServiceHero title={service.title} subtitle={service.shortDesc} image={['repair','design'].includes(service.slug) ? 'hero' : service.slug} />
    <div className="service-body">
      <Link to="/services" className="service-breadcrumb"><ChevronLeft aria-hidden="true" size={16}/>{tx('Все услуги')}</Link>
      <div className="service-detail-body">
        <div className="service-content">
          <div>{service.fullDesc.map((paragraph, i) => <p key={i}>{tx(paragraph)}</p>)}</div>
          <section><h2>{tx('Преимущества')}</h2><div className="service-benefits">{service.benefits.map(item=><div key={item.title}><h3>{tx(item.title)}</h3><p>{tx(item.desc)}</p></div>)}</div></section>
          <section><h2>{tx('Порядок работы')}</h2><ol className="service-steps">{service.steps.map(item=><li key={item.title}><h3>{tx(item.title)}</h3><p>{tx(item.desc)}</p></li>)}</ol></section>
          <section className="service-faq"><h2>{tx('Часто задаваемые вопросы')}</h2>{SERVICE_FAQ.map(item=><details key={item.q}><summary>{tx(item.q)}<Plus aria-hidden="true" size={20}/></summary><p>{tx(item.a)}</p></details>)}</section>
        </div>
        <aside className="service-contact-card"><p>{tx(service.priceNote)}</p><p className="service-price">{tx(service.priceRange)}</p><a href={COMPANY_CONTACTS.callHref} className="service-button service-button-green"><Phone aria-hidden="true" size={17}/>{COMPANY_CONTACTS.callDisplay}</a></aside>
      </div>
      <section className="service-related"><div className="service-section-heading"><h2 className="service-display">{tx('Другие услуги')}</h2></div><ServiceGrid items={SERVICES.filter(item=>item.slug!==slug).slice(0,3)}/><p className="service-media-note">{tx('Изображения услуг — иллюстрации.')}</p></section>
    </div>
  </div>;
}
