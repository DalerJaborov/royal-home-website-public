import { lazy, Suspense, useMemo } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { translations } from './data/translations';
import { useSwipeBackGesture } from './hooks/useSwipeBackGesture';
import { useStatusBarColor } from './hooks/useStatusBarColor';
import { useAnalyticsTracker } from './hooks/useAnalytics';
import Header from './components/Header';
import Footer from './components/Footer';
import MobileNav from './components/MobileNav';
import ScrollToTop from './components/ScrollToTop';
import ChatWidget from './components/ChatWidget';
import { CmsProvider } from './contexts/CmsContext';
import { LocaleProvider } from './contexts/LocaleContext';
import { useLocale } from './hooks/useLocale';
import { translateDisplayStrings } from './lib/localeText';
import Home from './pages/Home';
import NotFound from "./pages/NotFound"
import type { PublicLocaleDictionary } from '@contracts/public-i18n';

// Keep the home hero synchronous; below-the-fold home extras split inside Home.
import { InitialCatalogPage as ListingsPage } from './lib/initialCatalogPage';
const DistrictCatalogPage = lazy(() => import('./pages/DistrictCatalogPage'));
const ListingDetailPage = lazy(() => import('./pages/ListingDetailPage'));
const ServicesPage = lazy(() => import('./pages/ServicesPage'));
const AboutPage = lazy(() => import('./pages/AboutPage'));
const ContactsPage = lazy(() => import('./pages/ContactsPage'));
const PrivacyPage = lazy(() => import('./pages/PrivacyPage'));
const ServiceDetailPage = lazy(() => import('./pages/ServiceDetailPage'));
const MortgagePage = lazy(() => import('./pages/MortgagePage'));
const BlogPage = lazy(() => import('./pages/BlogPage'));
const BlogArticlePage = lazy(() => import('./pages/BlogArticlePage'));
const SellPage = lazy(() => import('./pages/SellPage'));
const FavoritesPage = lazy(() => import('./pages/FavoritesPage'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const AdminListingsPage = lazy(() => import('./pages/AdminListingsPage'));
const AdminListingForm = lazy(() => import('./pages/AdminListingForm'));
const AdminLogin = lazy(() => import('./pages/AdminLogin'));
const AdminResetPassword = lazy(() => import('./pages/AdminResetPassword'));
const AdminHeroSettingsPage = lazy(() => import('./pages/AdminHeroSettingsPage'));
const AdminBannersPage = lazy(() => import('./pages/AdminBannersPage'));
const AdminDushanbePage = lazy(() => import('./pages/AdminDushanbePage'));
const AdminServicesPage = lazy(() => import('./pages/AdminServicesPage'));
const AdminLeadsPage = lazy(() => import('./pages/AdminLeadsPage'));
const AdminSettingsPage = lazy(() => import('./pages/AdminSettingsPage'));
const AdminBlogPage = lazy(() => import('./pages/AdminBlogPage'));
const Login = lazy(() => import('./pages/Login'));

function AppShell() {
  const location = useLocation();
  const { basePath: pathname, locale, loading, error, retry, text } = useLocale();
  const t = useMemo(() => translateDisplayStrings(translations.ru, text), [text]);
  const isAdminRoute = pathname.startsWith('/admin') || pathname === '/login';
  useSwipeBackGesture();
  useStatusBarColor();
  useAnalyticsTracker();

  if (loading || error) {
    const status = locale === 'tg'
      ? (error ? 'Саҳифаро бор карда натавонистем.' : 'Саҳифа бор шуда истодааст…')
      : (error ? 'Unable to load this page.' : 'Loading page…');
    return <main className="min-h-screen grid place-content-center gap-5 p-6 text-center" aria-busy={loading}>
      <p role="status">{status}</p>
      {error && <button type="button" onClick={retry} className="btn-royal px-6 py-3 rounded-xl">{locale === 'tg' ? 'Бори дигар' : 'Try again'}</button>}
      <a href={pathname + location.search} className="underline underline-offset-4">Русский</a>
    </main>;
  }

  return (
    <CmsProvider>
      <div className="min-h-screen bg-white">
        <ScrollToTop />
        {!isAdminRoute && <Header t={t} />}
        <main className={isAdminRoute ? '' : 'pb-16 lg:pb-0'}>
          <Suspense fallback={<div className="min-h-screen" />}>
            <Routes location={{ ...location, pathname }}>
              <Route path="/" element={<Home t={t} />} />
              <Route path="/listings" element={<ListingsPage t={t} />} />
              <Route path="/kvartiry/:slug" element={<DistrictCatalogPage />} />
              <Route path="/listing/:id" element={<ListingDetailPage />} />
              <Route path="/sell" element={<SellPage />} />
              <Route path="/services" element={<ServicesPage t={t} />} />
              <Route path="/services/:slug" element={<ServiceDetailPage />} />
              <Route path="/mortgage" element={<MortgagePage />} />
              <Route path="/about" element={<AboutPage />} />
              <Route path="/contacts" element={<ContactsPage t={t} />} />
              <Route path="/privacy" element={<PrivacyPage />} />
              <Route path="/blog" element={<BlogPage t={t} />} />
              <Route path="/blog/:id" element={<BlogArticlePage />} />
              <Route path="/favorites" element={<FavoritesPage />} />
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/admin/login" element={<AdminLogin />} />
              <Route path="/admin/reset-password" element={<AdminResetPassword />} />
              <Route path="/admin/listings" element={<AdminListingsPage />} />
              <Route path="/admin/listings/new" element={<AdminListingForm />} />
              <Route path="/admin/listings/edit/:id" element={<AdminListingForm />} />
              <Route path="/admin/leads" element={<AdminLeadsPage />} />
              <Route path="/admin/hero" element={<AdminHeroSettingsPage />} />
              <Route path="/admin/banners" element={<AdminBannersPage />} />
              <Route path="/admin/dushanbe" element={<AdminDushanbePage />} />
              <Route path="/admin/services" element={<AdminServicesPage />} />
              <Route path="/admin/blog" element={<AdminBlogPage />} />
              <Route path="/admin/settings" element={<AdminSettingsPage />} />
              <Route path="/listing/preview/:id" element={<ListingDetailPage />} />
              <Route path="/login" element={<Login />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </main>
        {!isAdminRoute && <Footer />}
        {!isAdminRoute && <MobileNav />}
        {/* Только на публичных страницах: в админке чат с консультантом ни к чему. */}
        {!isAdminRoute && <ChatWidget />}
      </div>
    </CmsProvider>
  );
}

export default function App({ serverDictionary }: { serverDictionary?: PublicLocaleDictionary }) {
  return <LocaleProvider serverDictionary={serverDictionary}><AppShell /></LocaleProvider>;
}
