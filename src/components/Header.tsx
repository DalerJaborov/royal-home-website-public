import { useLocale } from '@/hooks/useLocale';
import { COMPANY_CONTACTS, COMPANY_HOURS, COMPANY_SOCIALS } from '@contracts/company-contacts';
import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { Link } from '@/components/LocalizedLink';
import { useAdminAuth } from '@/contexts/AdminAuthContext';
import { useFavorites } from '@/contexts/FavoritesContext';
import { useMobileMenu } from '@/contexts/MobileMenuContext';
import {
  Menu, X, Heart, Phone, Shield, MapPin, Mail, Clock,
} from 'lucide-react';
import AppInstallButtons from './AppInstallButtons';
import LanguageSwitcher from './LanguageSwitcher';
import WhatsAppIcon from './WhatsAppIcon';
import type { Translations } from '@/data/translations';

interface HeaderProps {
  t: Translations;
}

export default function Header({ t }: HeaderProps) {
  const { text: tx, basePath } = useLocale();
  const { open: mobileOpen, setOpen: setMobileOpen } = useMobileMenu();
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const [isScrolled, setIsScrolled] = useState(false);
  const location = useLocation();
  const nav = t.nav;
  const { isAdmin } = useAdminAuth();
  const { favorites } = useFavorites();
  const favCount = favorites.length;

  // Lock body scroll when menu is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  useEffect(() => {
    const panel = mobileMenuRef.current;
    if (!mobileOpen || !panel) return;
    const previousFocus = document.activeElement;
    const focusable = () => [...panel.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), select:not([disabled]), input:not([disabled]), [tabindex="0"]')]
      .filter((element) => element.getClientRects().length > 0);
    focusable()[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setMobileOpen(false);
      }
      if (event.key !== 'Tab') return;
      const controls = focusable();
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    panel.addEventListener('keydown', onKeyDown);
    return () => {
      panel.removeEventListener('keydown', onKeyDown);
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, [mobileOpen, setMobileOpen]);

  // On the home page the header stays fully transparent (just text over the
  // hero photo) until the user scrolls past it — then it gets the glass panel.
  // Detected via an IntersectionObserver on a top-of-page sentinel: plain
  // window scroll events proved unreliable here (they never fired in some
  // environments, leaving white header text stuck over white content).
  useEffect(() => {
    const sentinel = document.createElement('div');
    sentinel.style.cssText = 'position:absolute;top:0;left:0;height:60px;width:1px;pointer-events:none;visibility:hidden;';
    document.body.prepend(sentinel);
    const io = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(([entry]) => setIsScrolled(!entry.isIntersecting));
    io?.observe(sentinel);

    const onScroll = () => setIsScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      io?.disconnect();
      sentinel.remove();
    };
  }, []);

  const links = [
    { label: 'Главная', href: '/' },
    { label: nav.buy, href: '/listings' },
    { label: nav.services, href: '/services' },
    { label: nav.mortgage, href: '/mortgage' },
    { label: nav.blog, href: '/blog' },
    { label: nav.contacts, href: '/contacts' },
  ];

  const isHome = basePath === '/';
  // White text is only readable while the header floats over the dark hero
  // photo. The moment the page scrolls onto white content, switch to the
  // same light glass + dark text used on every other page.
  const overHero = isHome && !isScrolled;

  return (
    <>
      <header
        className={`site-header fixed top-0 inset-x-0 z-40 transition-all duration-300 border-b backdrop-blur-md ${
          overHero
            ? 'text-white bg-transparent border-transparent backdrop-blur-0'
            : 'text-gray-900 bg-white/85 border-gray-100 shadow-sm'
        }`}
      >
        <div className="section-padding">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-2.5 flex-shrink-0 relative z-10">
              <img
                src="/images/logo-royal-2026.webp"
                alt="ROYAL HOME"
                className="w-12 h-12 rounded-lg object-contain flex-shrink-0"
                style={overHero ? { filter: 'drop-shadow(0 1px 4px rgba(0,0,0,0.5))' } : undefined}
              />
              <div className="text-left min-w-0">
                <div
                  className="text-lg font-extrabold tracking-tight transition-colors duration-300"
                  style={{ color: overHero ? '#ffffff' : '#111827', textShadow: overHero ? '0 1px 4px rgba(0,0,0,0.55)' : 'none' }}
                >
                  {tx(t.siteName)}
                </div>
                <div
                  className="hidden min-[450px]:block text-[11px] uppercase tracking-[0.15em] -mt-0.5 transition-colors duration-300"
                  style={{ color: overHero ? 'rgba(255,255,255,0.75)' : '#6B7280', textShadow: overHero ? '0 1px 4px rgba(0,0,0,0.55)' : 'none' }}
                >
                  {tx(t.tagline)}
                </div>
              </div>
            </Link>

            {/* Desktop Nav */}
            <nav className="hidden min-[1380px]:flex items-center gap-0.5 shrink-0">
              {links.map((link) => (
                <Link
                  key={link.href}
                  to={link.href}
                  className={`px-3 py-2 rounded-lg text-base font-medium transition-all ${
                    basePath === link.href
                      ? (overHero ? 'bg-white/10 font-semibold' : 'bg-gray-900/5 font-semibold')
                      : (overHero ? 'hover:bg-white/10' : 'hover:bg-gray-900/5')
                  }`}
                  style={{
                    color: basePath === link.href
                      ? (overHero ? '#ffffff' : '#111827')
                      : (overHero ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.85)'),
                    textShadow: overHero ? '0 1px 4px rgba(0,0,0,0.5)' : 'none',
                  }}
                >
                  {tx(link.label)}
                </Link>
              ))}
              {isAdmin && (
                <Link
                  to="/admin"
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${
                    location.pathname.startsWith('/admin')
                      ? (overHero ? 'bg-white/10 font-semibold' : 'bg-gray-900/5 font-semibold')
                      : (overHero ? 'hover:bg-white/10' : 'hover:bg-gray-900/5')
                  }`}
                  style={{ color: overHero ? '#ffffff' : '#111827' }}
                >
                  <Shield className="w-3.5 h-3.5" />
                   {tx("Админ")} </Link>
              )}
            </nav>

            {/* Right side */}
            <div className="flex items-center gap-2 shrink-0">
              <a href={COMPANY_CONTACTS.whatsappHref} target="_blank" rel="noopener noreferrer"
                aria-label={tx('Написать ROYAL HOME в WhatsApp')}
                className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#1a4d3a] text-white hover:brightness-95 transition-colors">
                <WhatsAppIcon className="h-5 w-5" />
              </a>
              <div className="hidden xl:block"><LanguageSwitcher compact /></div>
              <Link
                to="/favorites"
                aria-label={tx('Избранное')}
                className={`hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all relative border ${
                  overHero
                    ? 'bg-white/10 border-white/20 text-white hover:bg-white/20'
                    : 'bg-gray-100/50 border-gray-200/50 text-gray-900 hover:bg-gray-100'
                }`}
              >
                <Heart className="w-4 h-4" />
                <span className="hidden 2xl:inline whitespace-nowrap">{tx("Избранное")}</span>
                {favCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1">
                    {favCount}
                  </span>
                )}
              </Link>
              {/* Desktop can't place calls — this is a plain label, not a tel: link
                  (which would otherwise hand off to Google Voice/Meet or similar). */}
              <div
                className={`hidden md:flex items-center gap-2 px-4 py-2.5 rounded-xl text-base font-semibold whitespace-nowrap border cursor-default select-text ${
                  overHero
                    ? 'bg-white/10 border-white/20 text-white'
                    : 'bg-gray-100/50 border-gray-200/50 text-gray-900'
                }`}
              >
                <Phone className="w-4 h-4" />
                <span className="hidden xl:inline">{tx(COMPANY_CONTACTS.callDisplay)}</span>
              </div>
              {/* Mobile burger */}
              <button
                className={`min-[1380px]:hidden p-2 rounded-lg transition-colors ${
                  overHero && !mobileOpen
                    ? 'bg-white/15 hover:bg-white/25 text-white'
                    : 'hover:bg-gray-100 text-gray-900'
                }`}
                onClick={() => setMobileOpen(!mobileOpen)}
                data-public-action="menu"
                aria-label={mobileOpen ? tx("Закрыть меню") : tx("Открыть меню")}
                aria-expanded={mobileOpen}
                aria-controls="mobile-menu"
              >
                {mobileOpen ? (
                  <X className="w-6 h-6" />
                ) : (
                  <Menu className="w-6 h-6" />
                )}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile slide-in menu */}
      {/* Overlay */}
      <div
        className={`fixed inset-0 bg-black/30 backdrop-blur-sm z-[110] min-[1380px]:hidden transition-opacity duration-300 ${
          mobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => setMobileOpen(false)}
      />
      {/* Slide-in panel from right */}
      <div
        ref={mobileMenuRef}
        id="mobile-menu"
        role="dialog"
        aria-label={tx("Навигация по сайту")}
        aria-modal={mobileOpen || undefined}
        aria-hidden={!mobileOpen}
        inert={!mobileOpen}
        style={{ contentVisibility: mobileOpen ? 'visible' : 'hidden', transitionProperty: 'transform, content-visibility', transitionBehavior: 'allow-discrete' }}
        className={`fixed top-0 right-0 bottom-0 w-[280px] z-[120] bg-white/95 backdrop-blur-xl border-l border-white/20 shadow-2xl min-[1380px]:hidden flex flex-col overflow-y-auto transform transition-transform duration-300 ease-out ${
          mobileOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Close button */}
        <button
          aria-label={tx("Закрыть меню")}
          className="absolute top-4 right-4 w-10 h-10 rounded-full bg-gray-100/50 flex items-center justify-center hover:bg-gray-200/50 transition-colors z-10"
          onClick={() => setMobileOpen(false)}
        >
          <X className="w-6 h-6 text-gray-900" />
        </button>

        {/* Logo */}
        <Link
          to="/"
          className="flex items-center gap-2.5 px-5 pt-6 pb-4"
          onClick={() => setMobileOpen(false)}
        >
          <img
            src="/images/logo-royal-2026.webp"
            alt="ROYAL HOME"
            className="w-12 h-12 rounded-lg object-contain"
          />
          <div>
            <div className="text-lg font-extrabold text-gray-900">{tx(t.siteName)}</div>
            <div className="text-[11px] uppercase tracking-[0.15em] text-gray-500">{tx(t.tagline)}</div>
          </div>
        </Link>

        {/* Nav links */}
        <div className="px-5 pb-4"><LanguageSwitcher onSelect={() => setMobileOpen(false)} /></div>
        <nav className="px-5 space-y-1">
          {links.map((link) => (
            <Link
              key={link.href}
              to={link.href}
              onClick={() => setMobileOpen(false)}
              className={`block w-full text-left px-4 py-3 rounded-xl text-base font-medium transition-colors ${
                basePath === link.href
                  ? 'text-gray-900 bg-gray-100/50 font-semibold'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              {tx(link.label)}
            </Link>
          ))}
        </nav>

        {/* Divider */}
        <div className="mx-5 my-4 border-t border-gray-100" />

        {/* Contact section */}
        <div className="px-5 space-y-3">
          <h4 className="text-xs font-bold text-gray-600 uppercase tracking-wider">{tx("Контакты")}</h4>
          <a href={COMPANY_CONTACTS.whatsappHref} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center gap-3 text-gray-700 hover:text-gray-900 transition-colors">
            <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
              <WhatsAppIcon className="w-4 h-4 text-emerald-800" />
            </div>
            <div>
              <div className="text-sm font-semibold text-gray-900">{COMPANY_CONTACTS.whatsappDisplay}</div>
              <div className="text-xs text-gray-600">{tx('Написать в WhatsApp')}</div>
            </div>
          </a>
          <a href={COMPANY_CONTACTS.callHref} className="flex items-center gap-3 text-gray-700 hover:text-gray-900 transition-colors">
            <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
              <Phone className="w-4 h-4 text-gray-700" />
            </div>
            <div>
              <div className="text-sm font-semibold text-gray-900">{tx(COMPANY_CONTACTS.callDisplay)}</div>
              <div className="text-xs text-gray-600">{tx("Колл-центр")}</div>
            </div>
          </a>
          <a href="mailto:info@royalhome.tj" className="flex items-center gap-3 text-gray-700 hover:text-gray-900 transition-colors">
            <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
              <Mail className="w-4 h-4 text-gray-700" />
            </div>
            <div>
              <div className="text-sm font-semibold text-gray-900">info@royalhome.tj</div>
              <div className="text-xs text-gray-600">Email</div>
            </div>
          </a>
          <div className="flex items-center gap-3 text-gray-700">
            <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
              <MapPin className="w-4 h-4 text-gray-700" />
            </div>
            <div>
              <div className="text-sm font-semibold text-gray-900">{tx("ул. Бухоро 49, 2 этаж")}</div>
              <div className="text-xs text-gray-600">{tx("г. Душанбе")}</div>
            </div>
          </div>
          <div className="flex items-center gap-3 text-gray-700">
            <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
              <Clock className="w-4 h-4 text-gray-700" />
            </div>
            <div>
              <div className="text-sm font-semibold text-gray-900">{tx(COMPANY_HOURS.display)}</div>
              <div className="text-xs text-gray-600">{tx("Воскресенье — выходной")}</div>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="mx-5 my-4 border-t border-gray-100" />

        {/* Socials */}
        <div className="px-5">
          <h4 className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-3">{tx("Мы в соцсетях")}</h4>
          <div className="flex items-center gap-2.5">
            <a aria-label={tx("ROYAL HOME в Instagram")} href="https://www.instagram.com/royal.home.tj/" target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-full bg-gradient-to-tr from-purple-500 via-pink-500 to-yellow-500 flex items-center justify-center hover:scale-110 transition-all">
              <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
            </a>
            <a aria-label={tx("ROYAL HOME в Facebook")} href="https://www.facebook.com/people/Royalhometj/61583608873603/" target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-full bg-[#1877F2] flex items-center justify-center hover:scale-110 transition-all">
              <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
            </a>

            <a aria-label={tx("ROYAL HOME в TikTok")} href={COMPANY_SOCIALS.tiktok} target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-full bg-black flex items-center justify-center hover:scale-110 transition-all">
              <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.88-2.88 2.89 2.89 0 012.88-2.88c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15.2a6.34 6.34 0 006.33 6.34 6.34 6.34 0 006.33-6.34V8.83a8.21 8.21 0 004.78 1.53V6.92a4.85 4.85 0 01-1-.23z"/></svg>
            </a>
            <a aria-label={tx("ROYAL HOME в Telegram")} href="https://t.me/royalhome_tj" target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-full bg-[#229ED9] flex items-center justify-center hover:scale-110 transition-all">
              <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
            </a>
          </div>
        </div>

        {/* Divider */}
        <div className="mx-5 my-4 border-t border-gray-100" />

        {/* Install as app — real PWA install, styled like store badges */}
        <div className="px-5">
          <h4 className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-3">{tx("Скачать приложение")}</h4>
          <AppInstallButtons compact />
        </div>

        {/* Primary messaging contact; the call line remains in the contact section. */}
        <div className="px-5 pb-6 mt-auto pt-4">
          <a
            href={COMPANY_CONTACTS.whatsappHref} target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 transition-colors active:scale-[0.98]"
          >
            <WhatsAppIcon className="w-5 h-5 text-gray-700/70 flex-shrink-0" />
            <span className="font-semibold text-gray-900 text-sm whitespace-nowrap">{tx('Написать в WhatsApp')}</span>
          </a>
        </div>
      </div>
    </>
  );
}
