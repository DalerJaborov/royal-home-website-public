import { useId } from 'react';
import { ArrowRight, Phone } from 'lucide-react';
import { COMPANY_CONTACTS } from '@contracts/company-contacts';
import { Link } from '@/components/LocalizedLink';
import { useLocale } from '@/hooks/useLocale';
import { SERVICE_VISUALS } from '@/data/serviceVisuals';
import '@/styles/service-design.css';
import DeferredImage from './DeferredImage';

export function ServiceIllustration({ name = 'hero', eager = false, className = '', sizes = '(min-width: 1024px) 55vw, 100vw' }: { name?: string; eager?: boolean; className?: string; sizes?: string }) {
  const Image = eager ? 'img' : DeferredImage;
  return <Image className={className} src={`/images/service-editorial/${name}-960.webp`}
    srcSet={[480, 960, 1440].map(width => `/images/service-editorial/${name}-${width}.webp ${width}w`).join(', ')}
    sizes={sizes} width="1440" height="960" alt=""
    loading={eager ? 'eager' : 'lazy'} fetchPriority={eager ? 'high' : undefined} decoding="async" />;
}

export function ServiceHero({ title, subtitle, heading = 'h1', image = 'hero', to, action, brand = false }: {
  title: string; subtitle: string; heading?: 'h1' | 'h2'; image?: string; to?: string; action?: string; brand?: boolean;
}) {
  const { text: tx } = useLocale();
  const id = useId().replace(/:/g, '');
  const Heading = heading;
  return <section className={`service-hero ${brand ? 'service-hero-promo' : ''}`}>
    <svg width="0" height="0" aria-hidden="true" className="service-clip-definition"><defs><clipPath id={`service-curve-${id}`} clipPathUnits="objectBoundingBox">
      <path d="M .28 0 H 1 V 1 H 0 C .015 .76 .09 .72 .15 .45 C .21 .18 .25 .22 .28 0 Z" />
    </clipPath></defs></svg>
    <div className="service-hero-photo" style={{ clipPath: `url(#service-curve-${id})` }}>
      <ServiceIllustration name={image} eager={heading === 'h1'} />
      <span className="service-photo-caption">{tx('Иллюстрация')}</span>
    </div>
    <div className="service-hero-copy">
      {brand && <div className="service-brand"><img src="/images/logo-royal-2026.webp" alt="" width="44" height="44" loading="lazy" /><span>ROYAL HOME</span></div>}
      <Heading className="service-display">{tx(title)}</Heading>
      <p>{tx(subtitle)}</p>
      <div className="service-hero-actions">
        {to ? <Link to={to} className="service-button service-button-light">{tx(action || 'Подробнее')}<ArrowRight aria-hidden="true" size={19} /></Link>
          : <a href={COMPANY_CONTACTS.callHref} className="service-button service-button-light">{tx(action || 'Обсудить задачу')}<ArrowRight aria-hidden="true" size={19} /></a>}
        {brand && <a href={COMPANY_CONTACTS.callHref} className="service-hero-phone"><Phone aria-hidden="true" size={17}/>{COMPANY_CONTACTS.callDisplay}</a>}
      </div>
    </div>
  </section>;
}

export type ServiceCardItem = { slug: string; title: string; desc?: string; image?: string };
export function ServiceGrid({ items }: { items: ServiceCardItem[] }) {
  const { text: tx } = useLocale();
  return <div className="service-grid">{items.map(item => {
    const visual = SERVICE_VISUALS[item.slug];
    const customImage = item.image && !/^\/images\/services\/(?:buyout|mortgage|repair|design|cleaning|advertising)(?:-v2)?\.(?:webp|png)$/.test(item.image);
    return <Link key={item.slug || item.title} to={item.slug ? `/services/${item.slug}` : '/services'} className="service-card">
      <div className="service-card-photo">{customImage ? <DeferredImage src={item.image} alt="" loading="lazy" decoding="async" width="480" height="320" />
        : <ServiceIllustration name={visual?.image || 'hero'} sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 100vw" />}</div>
      <div className="service-card-copy"><h3>{tx(item.title)}</h3><p>{tx(item.desc || visual?.summary || '')}</p>
        <span className="service-card-link">{tx('Подробнее')}<ArrowRight aria-hidden="true" size={18}/></span></div>
    </Link>;
  })}</div>;
}

export function ServiceCallout() {
  const { text: tx } = useLocale();
  return <section className="service-callout"><div><h2 className="service-display">{tx('Нужна консультация?')}</h2><p>{tx('Наши специалисты ответят на все ваши вопросы')}</p></div>
    <a href={COMPANY_CONTACTS.callHref} className="service-button service-button-green"><Phone aria-hidden="true" size={18}/>{COMPANY_CONTACTS.callDisplay}</a>
  </section>;
}
