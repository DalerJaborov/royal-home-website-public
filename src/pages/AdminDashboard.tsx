import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Building2, Users, FileText, Eye, TrendingUp, ArrowRight,
  BarChart3, Monitor, Sparkles, MapPin, Image, Settings, Activity,
  UserCheck, Clock, Globe, MessageSquare,
} from 'lucide-react';
import { useCms } from '@/contexts/CmsContext';
import { trpc } from '@/providers/trpc';
import { AnimatedNumber } from '@/components/AnimatedNumber';
import AdminLayout from '@/components/AdminLayout';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  AreaChart, Area, PieChart, Pie, Cell, Legend,
} from 'recharts';

// Adjacent-slice contrast matters more than a "brand-only" palette for a pie
// chart — alternating hue families so neighboring slices never blend together.
const COLORS = ['#1a4d3a', '#F6C453', '#2563eb', '#d97706', '#7c3aed', '#2d7a5e', '#94a3b8'];

// Человекочитаемые русские названия страниц вместо сырых путей в аналитике —
// админ видит «Объект №41», а не «/listing/41». Полный путь остаётся в title.
const PAGE_NAMES: Record<string, string> = {
  '/': 'Главная',
  '/listings': 'Каталог объектов',
  '/favorites': 'Избранное',
  '/contacts': 'Контакты',
  '/blog': 'Блог',
  '/mortgage': 'Ипотека',
  '/sell': 'Продать квартиру',
  '/services': 'Услуги',
  '/about': 'О компании',
};
const SERVICE_NAMES: Record<string, string> = {
  advertising: 'Реклама недвижимости',
  buyout: 'Срочный выкуп',
  repair: 'Ремонт под ключ',
  design: 'Дизайн интерьера',
  legal: 'Юридическое сопровождение',
  mortgage: 'Ипотека',
};
function pageLabel(path: string): string {
  if (PAGE_NAMES[path]) return PAGE_NAMES[path];
  const listing = path.match(/^\/listing\/(\d+)$/);
  if (listing) return `Объект №${listing[1]}`;
  const service = path.match(/^\/services\/([a-z0-9-]+)$/);
  if (service) return SERVICE_NAMES[service[1]] ? `Услуга: ${SERVICE_NAMES[service[1]]}` : `Услуга: ${service[1]}`;
  const blogNum = path.match(/^\/blog\/(\d+)$/);
  if (blogNum) return `Статья №${blogNum[1]}`;
  const blogSlug = path.match(/^\/blog\/([a-z0-9-]+)$/);
  if (blogSlug) return `Статья: ${blogSlug[1]}`;
  return path;
}

export default function AdminDashboard() {
  const { cms } = useCms();
  // Реальная посещаемость с сервера (см. api/analytics-router.ts) — раньше
  // это читалось из localStorage браузера и показывало только собственные
  // просмотры админа, а не трафик настоящих посетителей.
  const { data: summary } = trpc.analytics.summary.useQuery(undefined, { refetchInterval: 30_000 });
  const analytics = summary ?? {
    total: 0, today: 0, yesterday: 0, month: 0, year: 0,
    uniqueToday: 0, uniqueMonth: 0,
    topPages: [] as [string, number][],
  };
  const weekly = summary?.weekly ?? [];
  const popularListings = summary?.popularListings ?? [];
  const { data: serverListings } = trpc.listing.list.useQuery({
    includeUnpublished: true,
    includeAllCategories: true,
  });
  const { data: leads } = trpc.lead.list.useQuery();
  const newLeadsCount = leads?.filter(l => l.status === 'new').length ?? 0;
  const listings = serverListings ?? [];

  const totalListings = listings.length;
  // Статьи блога живут в двух местах: старые в cms, новые пишет генератор в
  // таблицу articles. Считать только cms — значит показывать 6 там, где 7.
  const { data: aiArticles } = trpc.blog.adminList.useQuery();
  const totalBlog = cms.blogPosts.length + (aiArticles?.length ?? 0);
  const activeServices = cms.services.filter(s => s.active).length;

  // Four distinct hues, not four shades of the same green — the old palette
  // (green/green/gold/green) made 3 of the 4 KPI cards nearly indistinguishable.
  const kpiCards = [
    { label: 'Всего объектов', value: totalListings, icon: Building2, gradient: 'from-[#1a4d3a] to-[#0f2e22]', growth: '+12%', href: '/admin/listings', accent: '#F6C453' },
    { label: 'Статей в блоге', value: totalBlog, icon: FileText, gradient: 'from-[#F6C453] to-[#d97706]', growth: '+8%', href: '/admin/blog', accent: '#1a4d3a' },
    { label: 'Активных услуг', value: activeServices, icon: Sparkles, gradient: 'from-[#7c3aed] to-[#5b21b6]', growth: '+3%', href: '/admin/services', accent: '#F6C453' },
  ];

  const maxVisitors = Math.max(analytics.today, analytics.yesterday, analytics.month, analytics.year, 1);
  const visitorStats = [
    { label: 'Просмотров сегодня', value: analytics.today, icon: Activity, percent: (analytics.today / maxVisitors) * 100 },
    { label: 'Просмотров вчера', value: analytics.yesterday, icon: Clock, percent: (analytics.yesterday / maxVisitors) * 100 },
    { label: 'Просмотров за месяц', value: analytics.month, icon: TrendingUp, percent: (analytics.month / maxVisitors) * 100 },
    { label: 'Просмотров за год', value: analytics.year, icon: BarChart3, percent: (analytics.year / maxVisitors) * 100 },
  ];
  // Отдельно от просмотров страниц: один гость обычно листает несколько
  // страниц за визит, поэтому "просмотров" и "людей" — разные числа.
  const maxUnique = Math.max(analytics.uniqueToday, analytics.uniqueMonth, 1);
  const uniqueStats = [
    { label: 'Гостей сегодня', value: analytics.uniqueToday, icon: UserCheck, percent: (analytics.uniqueToday / maxUnique) * 100 },
    { label: 'Гостей за месяц', value: analytics.uniqueMonth, icon: Users, percent: (analytics.uniqueMonth / maxUnique) * 100 },
  ];

  const topPagesData = analytics.topPages.slice(0, 5).map(([name, value]) => ({ name: pageLabel(name), value }));
  const weeklyData = weekly;

  const quickLinks = [
    { label: 'Объекты', desc: `${totalListings} объектов`, icon: Building2, href: '/admin/listings', color: 'bg-emerald-50 text-emerald-700', hover: 'hover:border-emerald-300 hover:shadow-emerald-100' },
    { label: 'Заявки', desc: newLeadsCount > 0 ? `${newLeadsCount} новых` : 'Нет новых', icon: MessageSquare, href: '/admin/leads', color: 'bg-red-50 text-red-700', hover: 'hover:border-red-300 hover:shadow-red-100' },
    { label: 'Блог', desc: `${totalBlog} статей`, icon: FileText, href: '/admin/blog', color: 'bg-amber-50 text-amber-700', hover: 'hover:border-amber-300 hover:shadow-amber-100' },
    { label: 'Hero', desc: 'Главный баннер', icon: Monitor, href: '/admin/hero', color: 'bg-pink-50 text-pink-700', hover: 'hover:border-pink-300 hover:shadow-pink-100' },
    { label: '3D Баннеры', desc: 'Промо-баннеры', icon: Image, href: '/admin/banners', color: 'bg-cyan-50 text-cyan-700', hover: 'hover:border-cyan-300 hover:shadow-cyan-100' },
    { label: 'Душанбе', desc: 'Баннер города', icon: MapPin, href: '/admin/dushanbe', color: 'bg-green-50 text-green-700', hover: 'hover:border-green-300 hover:shadow-green-100' },
    { label: 'Услуги', desc: `${activeServices} активных`, icon: Sparkles, href: '/admin/services', color: 'bg-purple-50 text-purple-700', hover: 'hover:border-purple-300 hover:shadow-purple-100' },
    { label: 'Настройки', desc: 'Соцсети, SEO', icon: Settings, href: '/admin/settings', color: 'bg-gray-50 text-gray-700', hover: 'hover:border-gray-300 hover:shadow-gray-100' },
  ];

  const rankColors = [
    'bg-amber-100 text-amber-700',
    'bg-gray-200 text-gray-600',
    'bg-orange-100 text-orange-700',
    'bg-slate-100 text-slate-600',
    'bg-slate-100 text-slate-600',
  ];

  const tooltipStyle = { backgroundColor: '#1a4d3a', border: 'none', borderRadius: '12px', color: '#fff', fontSize: '12px' };

  return (
    <AdminLayout>
      <div className="p-4 lg:p-8" style={{ background: '#f6f8f6' }}>
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8 flex items-center justify-between"
        >
          <div>
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Дашборд</h1>
            <p className="text-sm text-gray-500 mt-1">Обзор сайта и аналитика посетителей</p>
          </div>
          <div className="hidden lg:flex items-center gap-2 text-sm text-gray-400">
            <Clock className="w-4 h-4" /> Обновляется каждые 30 сек
          </div>
        </motion.div>

        {/* KPI Cards — CRM style */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {kpiCards.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
            >
              <Link
                to={s.href}
                className="block rounded-2xl p-5 text-white shadow-lg hover:shadow-xl transition-all duration-300 group relative overflow-hidden"
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${s.gradient} opacity-100`} />
                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center backdrop-blur-sm">
                      <s.icon className="w-5 h-5" style={{ color: s.accent }} />
                    </div>
                    <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-white/20 backdrop-blur-sm">{s.growth}</span>
                  </div>
                  <div className="text-3xl font-extrabold tracking-tight"><AnimatedNumber value={s.value} /></div>
                  <div className="text-xs font-medium opacity-80 mt-1">{s.label}</div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>

        {/* Charts Row */}
        <div className="grid lg:grid-cols-3 gap-6 mb-8">
          {/* BarChart — Weekly visits */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 p-6"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-emerald-600" /> Посещения за 7 дней
              </h2>
              <span className="text-xs text-gray-400">{weekly.reduce((s, d) => s + d.count, 0)} всего</span>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeklyData} barCategoryGap="20%">
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#f0fdf4' }} />
                  <Bar dataKey="count" name="Просмотров" radius={[8, 8, 0, 0]} fill="url(#barGradient)" />
                  <defs>
                    <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#2d7a5e" />
                      <stop offset="100%" stopColor="#1a4d3a" />
                    </linearGradient>
                  </defs>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </motion.div>

          {/* PieChart — Top pages */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="bg-white rounded-2xl border border-gray-100 p-6"
          >
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Globe className="w-5 h-5 text-emerald-600" /> Топ страниц
            </h2>
            <div className="h-56">
              {topPagesData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={topPagesData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {topPagesData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-gray-400 text-sm">Нет данных</div>
              )}
            </div>
          </motion.div>
        </div>

        {/* LineChart + Visitor stats */}
        <div className="grid lg:grid-cols-3 gap-6 mb-8">
          {/* LineChart — Trend */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 p-6"
          >
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-600" /> Тренд посещаемости
            </h2>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={weeklyData}>
                  <defs>
                    <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#F6C453" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#F6C453" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Area type="monotone" dataKey="count" name="Просмотров" stroke="#F6C453" strokeWidth={3} fill="url(#areaGradient)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </motion.div>

          {/* Visitor stats cards */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.5 }}
            className="bg-white rounded-2xl border border-gray-100 p-6"
          >
            <h2 className="text-lg font-bold text-gray-900 mb-5 flex items-center gap-2">
              <Eye className="w-5 h-5 text-emerald-600" /> Аналитика
            </h2>
            <div className="space-y-4">
              {visitorStats.map((v, i) => (
                <motion.div
                  key={v.label}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3, delay: 0.6 + i * 0.08 }}
                  className="p-4 rounded-xl bg-gray-50/70 border border-gray-100"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center shadow-sm">
                        <v.icon className="w-4 h-4 text-gray-500" />
                      </div>
                      <span className="text-xs text-gray-500 font-medium">{v.label}</span>
                    </div>
                    <div className="text-xl font-extrabold text-gray-900"><AnimatedNumber value={v.value} /></div>
                  </div>
                  <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${v.percent}%` }}
                      transition={{ duration: 0.8, delay: 0.8 + i * 0.1 }}
                      className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-500"
                    />
                  </div>
                </motion.div>
              ))}
              <div className="border-t border-gray-100 pt-4 mt-1 space-y-4">
                {uniqueStats.map((v, i) => (
                  <motion.div
                    key={v.label}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.3, delay: 0.9 + i * 0.08 }}
                    className="p-4 rounded-xl bg-gray-50/70 border border-gray-100"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center shadow-sm">
                          <v.icon className="w-4 h-4 text-gray-500" />
                        </div>
                        <span className="text-xs text-gray-500 font-medium">{v.label}</span>
                      </div>
                      <div className="text-xl font-extrabold text-gray-900"><AnimatedNumber value={v.value} /></div>
                    </div>
                    {/* Синий градиент вместо зелёного у просмотров — отдельная
                        метрика (люди, а не открытые страницы), цвет не должен
                        сливаться с полосками просмотров выше. */}
                    <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${v.percent}%` }}
                        transition={{ duration: 0.8, delay: 1.1 + i * 0.1 }}
                        className="h-full rounded-full bg-gradient-to-r from-blue-400 to-blue-600"
                      />
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>

        {/* Top pages + Popular listings */}
        {analytics.topPages.length > 0 && (
          <div className="grid lg:grid-cols-2 gap-6 mb-8">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 0.5 }}
              className="bg-white rounded-2xl border border-gray-100 p-6"
            >
              <h3 className="text-sm font-bold text-gray-700 mb-3">Популярные страницы</h3>
              <div className="space-y-2">
                {analytics.topPages.map(([path, count], idx) => (
                  <a
                    key={path}
                    href={path}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 p-2.5 rounded-xl bg-gray-50/70 hover:bg-gray-100 transition-colors"
                  >
                    <span className={`w-6 h-6 flex items-center justify-center rounded-md text-xs font-bold ${rankColors[idx] || rankColors[3]}`}>
                      {idx + 1}
                    </span>
                    <span className="text-sm text-gray-700 font-medium truncate flex-1" title={path}>{pageLabel(path)}</span>
                    <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg">{count} просмотров</span>
                  </a>
                ))}
              </div>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 0.6 }}
              className="bg-white rounded-2xl border border-gray-100 p-6"
            >
              <h3 className="text-sm font-bold text-gray-700 mb-3">Популярные объекты</h3>
              {popularListings.length > 0 ? (
                <div className="space-y-2">
                  {popularListings.map(({ id, count }, idx) => {
                    const listing = listings.find(l => l.id === id);
                    return listing ? (
                      <Link key={id} to={`/listing/${id}`} target="_blank" className="flex items-center gap-3 p-2.5 rounded-xl bg-gray-50/70 hover:bg-emerald-50 transition-colors">
                        <span className={`w-6 h-6 flex items-center justify-center rounded-md text-xs font-bold ${rankColors[idx] || rankColors[3]}`}>
                          {idx + 1}
                        </span>
                        <span className="text-sm text-gray-700 font-medium truncate flex-1">{listing.title}</span>
                        <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-1 rounded-lg">{count} просм.</span>
                      </Link>
                    ) : null;
                  })}
                </div>
              ) : (
                <p className="text-sm text-gray-400 p-4 bg-gray-50 rounded-xl">Пока нет данных о просмотрах объектов</p>
              )}
            </motion.div>
          </div>
        )}

        {/* Quick links */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.7 }}
        >
          <h2 className="text-lg font-bold text-gray-900 mb-4">Быстрый доступ</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {quickLinks.map((item, i) => (
              <motion.div
                key={item.label}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.8 + i * 0.05 }}
              >
                <Link
                  to={item.href}
                  className={`block bg-white rounded-2xl p-4 border border-gray-100 hover:shadow-md transition-all duration-300 group ${item.hover}`}
                >
                  <div className={`w-10 h-10 rounded-xl ${item.color} flex items-center justify-center mb-3 group-hover:scale-110 transition-transform`}>
                    <item.icon className="w-5 h-5" />
                  </div>
                  <div className="font-semibold text-gray-900 text-sm">{item.label}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{item.desc}</div>
                  <div className="flex items-center gap-1 mt-3 text-xs font-semibold text-emerald-700 opacity-0 group-hover:opacity-100 transition-opacity transform translate-x-0 group-hover:translate-x-1">
                    Перейти <ArrowRight className="w-3 h-3" />
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </AdminLayout>
  );
}
