import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAdminAuth } from '@/contexts/AdminAuthContext';
import {
  LayoutDashboard,
  Building2,
  Settings,
  LogOut,
  ChevronLeft,
  Shield,
  Image,
  Monitor,
  Sparkles,
  MapPin,
  FileText,
  MessageSquare,
} from 'lucide-react';
import type { ReactNode } from 'react';

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { isAdmin, isLoading, logout } = useAdminAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // Hooks must run in the same order every render, so this effect has to
  // sit above the isLoading/isAdmin early returns below, not after them.
  useEffect(() => {
    if (!isLoading && !isAdmin) {
      navigate('/admin/login');
    }
  }, [isLoading, isAdmin, navigate]);

  // Wait for the session check to come back before deciding — checking
  // the session is now a real network request, not a synchronous read, so
  // redirecting on the first (still-loading) render would bounce an
  // already-logged-in admin to /login on every page refresh.
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-2 border-emerald-800 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  const navItems = [
    { href: '/admin', label: 'Дашборд', icon: LayoutDashboard },
    { href: '/admin/listings', label: 'Объекты', icon: Building2 },
    { href: '/admin/leads', label: 'Заявки', icon: MessageSquare },
    { href: '/admin/hero', label: 'Настройки Hero', icon: Monitor },
    { href: '/admin/banners', label: '3D Баннеры', icon: Image },
    { href: '/admin/dushanbe', label: 'Баннер Душанбе', icon: MapPin },
    { href: '/admin/services', label: 'Услуги', icon: Sparkles },
    { href: '/admin/blog', label: 'Блог', icon: FileText },
    { href: '/admin/settings', label: 'Настройки сайта', icon: Settings },
  ];

  return (
    <div className="admin-shell min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside
        className="w-64 border-r border-white/10 flex-shrink-0 hidden lg:flex flex-col relative overflow-hidden z-50"
        style={{
          background: 'linear-gradient(180deg, #334155 0%, #1e293b 100%)',
        }}
      >
        <div className="p-5 border-b border-white/10 relative z-10">
          <Link to="/" className="flex items-center gap-3">
            <img
              src="/images/logo-royal-2026.webp"
              alt="Royal Home"
              className="w-10 h-10 rounded-xl object-contain shadow-sm"
            />
            <div>
              <div className="text-base font-extrabold text-white leading-tight">Royal Home</div>
              <div className="text-[10px] uppercase tracking-widest text-white/50 font-medium">Админ-панель</div>
            </div>
          </Link>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto relative z-10">
          {navItems.map((item, index) => {
            const isActive = location.pathname === item.href;
            const showSeparator = index === 3 || index === 8;
            return (
              <div key={item.href}>
                <Link
                  to={item.href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    isActive
                      ? 'text-white shadow-sm bg-white/15'
                      : 'text-white/70 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </Link>
                {showSeparator && (
                  <div className="my-2 mx-3 h-px bg-white/10" />
                )}
              </div>
            );
          })}
        </nav>

        <div className="p-3 border-t border-white/10 space-y-2 relative z-10">
          <Link to="/" className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-white/60 hover:bg-white/10 transition-colors">
            <ChevronLeft className="w-4 h-4" />
            На сайт
          </Link>
          <button
            onClick={() => { logout().then(() => navigate('/')).catch(() => navigate('/')); }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-red-300 hover:bg-red-500/20 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Выйти
          </button>
          <div className="flex justify-center pt-1">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white/10 text-white/40 tracking-wide">
              v3.0
            </span>
          </div>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-[100] bg-white/80 backdrop-blur-md border-b border-gray-200/80">
        <div className="flex items-center justify-between px-3 h-16">
          <Link to="/admin" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#334155' }}>
              <Shield className="w-4 h-4 text-amber-400" />
            </div>
            <span className="text-sm font-bold">Админ</span>
          </Link>
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
            {navItems.map((item) => {
              const isActive = location.pathname === item.href;
              return (
                <Link key={item.href} to={item.href}
                  className={`p-2.5 rounded-xl flex-shrink-0 transition-all ${
                    isActive
                      ? 'text-white'
                      : 'text-gray-400 hover:bg-gray-100'
                  }`}
                  style={isActive ? { backgroundColor: '#1a4d3a' } : undefined}
                >
                  <item.icon className="w-5 h-5" />
                </Link>
              );
            })}
            <button onClick={() => { logout().then(() => navigate('/')).catch(() => navigate('/')); }} className="p-2.5 rounded-xl text-red-400 hover:bg-red-50 flex-shrink-0 transition-colors">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      <main className="flex-1 min-w-0 pt-20 lg:pt-6 relative z-0">{children}</main>
    </div>
  );
}
