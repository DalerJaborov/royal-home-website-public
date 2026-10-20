import { useState } from 'react';
import { useCms, CATEGORY_LABELS, type ReelItem, type CategoryVisibility, type BankItem } from '@/contexts/CmsContext';
import AdminLayout from '@/components/AdminLayout';
import FileUpload from '@/components/FileUpload';
import TwoFactorSettings from '@/components/TwoFactorSettings';
import { Save, Phone, Instagram, Facebook, Send, Globe, RotateCcw, AlertTriangle, Clock, Mail, MapPin, FileText, MessageCircle, Video, Plus, Trash2, Building2, Home, Store, Trees } from 'lucide-react';

export default function AdminSettingsPage() {
  const { cms, updateSite, updateReels, updateCategoryVisibility, updateBanks, resetToDefault } = useCms();
  const [form, setForm] = useState(cms.site);
  const [reelsForm, setReelsForm] = useState(cms.reels);
  const [banksForm, setBanksForm] = useState(cms.banks);
  const [saved, setSaved] = useState(false);
  const [showReset, setShowReset] = useState(false);

  const handleSave = () => { updateSite(form); updateReels(reelsForm); updateBanks(banksForm); setSaved(true); setTimeout(() => setSaved(false), 2000); };

  const updateBankField = (idx: number, patch: Partial<BankItem>) => {
    setBanksForm(p => p.map((b, i) => (i === idx ? { ...b, ...patch } : b)));
  };

  const updateReelItem = (id: number, patch: Partial<ReelItem>) => {
    setReelsForm(p => ({ ...p, items: p.items.map(r => r.id === id ? { ...r, ...patch } : r) }));
  };
  const addReel = () => {
    setReelsForm(p => ({
      ...p,
      items: [...p.items, { id: Math.max(0, ...p.items.map(r => r.id)) + 1, url: p.profileUrl, cover: '', caption: '' }],
    }));
  };
  const removeReel = (id: number) => {
    setReelsForm(p => ({ ...p, items: p.items.filter(r => r.id !== id) }));
  };
  const handleReset = () => { resetToDefault(); setShowReset(false); };

  const inputClass = 'w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-800/30 transition-all';
  const labelClass = 'flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2';

  const toggleSocial = (key: keyof typeof form.socialVisibility) => {
    setForm(p => ({ ...p, socialVisibility: { ...p.socialVisibility, [key]: !p.socialVisibility[key] } }));
  };

  const updatePageSeo = (page: keyof typeof form.pageSeo, field: 'title' | 'description' | 'h1', value: string) => {
    setForm(p => ({
      ...p,
      pageSeo: { ...p.pageSeo, [page]: { ...p.pageSeo[page], [field]: value } },
    }));
  };

  const pages = [
    { key: 'home', label: 'Главная', icon: Globe },
    { key: 'listings', label: 'Объекты', icon: MapPin },
    { key: 'services', label: 'Услуги', icon: FileText },
    { key: 'about', label: 'О компании', icon: MessageCircle },
    { key: 'contacts', label: 'Контакты', icon: Phone },
    { key: 'blog', label: 'Блог', icon: FileText },
  ] as const;

  return (
    <AdminLayout>
      <div className="p-4 lg:p-8 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div><h1 className="text-2xl font-bold text-gray-900">Настройки сайта</h1><p className="text-sm text-gray-500 mt-1">Контакты, соцсети, SEO, аналитика</p></div>
          <button onClick={handleSave} className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90" style={{ backgroundColor: '#1a4d3a' }}>
            <Save className="w-4 h-4" /> {saved ? 'Сохранено!' : 'Сохранить'}
          </button>
        </div>

        <div className="space-y-6">
          {/* Contacts */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2"><Phone className="w-5 h-5" /> Контакты</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label className={labelClass}><Phone className="w-4 h-4 text-gray-400" /> Телефон для звонков</label><input type="text" value={form.phone} readOnly className={inputClass} /></div>
              <div><label className={labelClass}><Mail className="w-4 h-4 text-gray-400" /> Email</label><input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} className={inputClass} /></div>
              <div className="sm:col-span-2"><label className={labelClass}><MapPin className="w-4 h-4 text-gray-400" /> Адрес</label><input type="text" value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} className={inputClass} /></div>
              <div><label className={labelClass}><Clock className="w-4 h-4 text-gray-400" /> График работы</label><input type="text" value={form.workHours} onChange={e => setForm(p => ({ ...p, workHours: e.target.value }))} className={inputClass} /></div>
              <div className="sm:col-span-2">
                <label className={labelClass}><MapPin className="w-4 h-4 text-gray-400" /> Карта на странице «Контакты» (ссылка Яндекс-виджета)</label>
                <input type="text" value={form.mapEmbedUrl ?? ''} onChange={e => setForm(p => ({ ...p, mapEmbedUrl: e.target.value }))} className={inputClass} placeholder="https://yandex.ru/map-widget/v1/?..." />
                <p className="text-xs text-gray-400 mt-1.5">Яндекс.Карты → найдите адрес → «Поделиться» → «Виджет карты» → скопируйте ссылку из src. Пустое поле — карта офиса на ул. Бухоро 49.</p>
              </div>
              <div><label className={labelClass}><MessageCircle className="w-4 h-4 text-gray-400" /> WhatsApp</label><input type="text" value="Номер не подтверждён" readOnly className={inputClass} /><p className="text-xs text-gray-500 mt-1.5">Старая линия не работает. Ссылка скрыта до подтверждения нового номера.</p></div>
            </div>
          </div>

          {/* Socials */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2"><Send className="w-5 h-5" /> Соцсети</h2>
            <div className="space-y-4">
              {([
                { key: 'instagram', label: 'Instagram', icon: Instagram, color: 'text-pink-500' },
                { key: 'facebook', label: 'Facebook', icon: Facebook, color: 'text-blue-600' },
                { key: 'tiktok', label: 'TikTok', icon: Video, color: 'text-gray-900' },
                { key: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, color: 'text-emerald-500' },
                { key: 'telegram', label: 'Telegram', icon: Send, color: 'text-blue-400' },
              ] as const).map(({ key, label, icon: Icon, color }) => (
                <div key={key} className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-xl bg-gray-50/50 border border-gray-100">
                  {/* Кнопка-переключатель, а не div с onClick: с клавиатуры до
                      него было не добраться, а диктор не понимал, что это
                      переключатель и в каком он положении. Рядом, в
                      AdminAiArticles, такой же переключатель давно сделан верно —
                      это была несогласованность, а не решение. */}
                  <div className="flex items-center gap-3 min-w-[140px]">
                    <button
                      type="button"
                      role="switch"
                      disabled={key === 'whatsapp'}
                      aria-checked={!!form.socialVisibility[key as keyof typeof form.socialVisibility]}
                      aria-label={`Показывать ${label} на сайте`}
                      className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${form.socialVisibility[key as keyof typeof form.socialVisibility] ? 'bg-emerald-500' : 'bg-gray-300'}`}
                      onClick={() => toggleSocial(key as keyof typeof form.socialVisibility)}
                    >
                      <div className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all ${form.socialVisibility[key as keyof typeof form.socialVisibility] ? 'left-[22px]' : 'left-[2px]'}`} />
                    </button>
                    <span className="text-sm font-semibold text-gray-700 flex items-center gap-1.5"><Icon className={`w-4 h-4 ${color}`} />{label}</span>
                  </div>
                  <input
                    type="text"
                    value={form[key] || ''}
                    readOnly={key === 'whatsapp'}
                    onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                    placeholder={`Ссылка или @username для ${label}`}
                    className={`${inputClass} flex-1`}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Property categories visible in the public catalog (CRM sync).
              Persisted instantly per toggle — not part of the Save button's
              form, because it lives in its own CMS section. */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-1 flex items-center gap-2"><Building2 className="w-5 h-5" /> Типы объектов на сайте</h2>
            <p className="text-xs text-gray-500 mb-4">
              Какие типы объектов из CRM показывать в каталоге. Квартиры — основной контент сайта;
              дома, коммерческую и участки включайте, когда появятся реальные объекты.
            </p>
            <div className="space-y-3">
              {([
                { key: 'APARTMENT', icon: Building2 },
                { key: 'HOUSE', icon: Home },
                { key: 'COMMERCIAL', icon: Store },
                { key: 'LAND', icon: Trees },
              ] as const).map(({ key, icon: Icon }) => (
                <label key={key} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50/50 border border-gray-100 cursor-pointer">
                  <div
                    className={`w-11 h-6 rounded-full transition-colors relative ${cms.categoryVisibility[key] ? 'bg-emerald-500' : 'bg-gray-300'}`}
                    onClick={() => updateCategoryVisibility({ [key]: !cms.categoryVisibility[key] } as Partial<CategoryVisibility>)}
                  >
                    <div className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all ${cms.categoryVisibility[key] ? 'left-[22px]' : 'left-[2px]'}`} />
                  </div>
                  <span className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                    <Icon className="w-4 h-4 text-emerald-700" />{CATEGORY_LABELS[key]}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Ставки банков на странице «Ипотека» — сохраняются кнопкой Сохранить */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-1 flex items-center gap-2"><Building2 className="w-5 h-5" /> Ставки банков (Ипотека)</h2>
            <p className="text-xs text-gray-500 mb-4">
              Годовая ставка участвует в ипотечном калькуляторе. Пометка показывается под ставкой
              (например, «госпрограмма»). Ставки сверяйте с банками — они меняются.
            </p>
            <div className="space-y-2">
              {banksForm.map((b, i) => (
                <div key={i} className="flex flex-col gap-3 p-3 rounded-xl bg-gray-50/50 border border-gray-100">
                  <div className="flex items-center gap-3">
                    <div className="w-14 h-10 rounded-lg flex items-center justify-center flex-shrink-0 p-1" style={{ backgroundColor: b.bg }}>
                      <img src={b.logo} alt={b.name} className="w-full h-full object-contain" />
                    </div>
                    <input
                      type="text"
                      value={b.name}
                      onChange={e => updateBankField(i, { name: e.target.value })}
                      placeholder="Название банка"
                      className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-white border border-gray-200 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-800/30"
                    />
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <input
                        type="number"
                        min={1}
                        max={60}
                        step={0.5}
                        value={b.rate}
                        onChange={e => updateBankField(i, { rate: Number(e.target.value) || 0 })}
                        className="w-20 px-3 py-2 rounded-lg bg-white border border-gray-200 text-sm text-right focus:outline-none focus:ring-2 focus:ring-emerald-800/30"
                      />
                      <span className="text-sm text-gray-500">%</span>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="w-44 flex-shrink-0">
                      <FileUpload value={b.logo} onChange={(url) => updateBankField(i, { logo: url })} label="Логотип" />
                    </div>
                    <input
                      type="text"
                      value={b.note ?? ''}
                      onChange={e => updateBankField(i, { note: e.target.value || undefined })}
                      placeholder="пометка (необязательно, напр. «госпрограмма»)"
                      className="flex-1 px-3 py-2 rounded-lg bg-white border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-800/30"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Instagram Reels on home page */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2"><Instagram className="w-5 h-5 text-pink-500" /> Instagram / Reels на главной</h2>
              <label className="flex items-center gap-2 cursor-pointer">
                <div
                  className={`w-11 h-6 rounded-full transition-colors relative ${reelsForm.enabled ? 'bg-emerald-500' : 'bg-gray-300'}`}
                  onClick={() => setReelsForm(p => ({ ...p, enabled: !p.enabled }))}
                >
                  <div className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all ${reelsForm.enabled ? 'left-[22px]' : 'left-[2px]'}`} />
                </div>
                <span className="text-sm font-semibold text-gray-700">{reelsForm.enabled ? 'Включено' : 'Выключено'}</span>
              </label>
            </div>
            <p className="text-xs text-gray-400 mb-4">Карточки-видео на главной странице. Обложку загрузите сюда, ссылка ведёт на рилс в Instagram.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
              <div><label className={labelClass}>Заголовок секции</label><input type="text" value={reelsForm.title} onChange={e => setReelsForm(p => ({ ...p, title: e.target.value }))} className={inputClass} /></div>
              <div><label className={labelClass}>Подзаголовок</label><input type="text" value={reelsForm.subtitle} onChange={e => setReelsForm(p => ({ ...p, subtitle: e.target.value }))} className={inputClass} /></div>
              <div><label className={labelClass}>Ник в Instagram</label><input type="text" value={reelsForm.handle} onChange={e => setReelsForm(p => ({ ...p, handle: e.target.value }))} className={inputClass} placeholder="@royal.home.tj" /></div>
              <div><label className={labelClass}>Ссылка на профиль</label><input type="text" value={reelsForm.profileUrl} onChange={e => setReelsForm(p => ({ ...p, profileUrl: e.target.value }))} className={inputClass} /></div>
            </div>
            <div className="space-y-3">
              {reelsForm.items.map((reel) => (
                <div key={reel.id} className="flex flex-col sm:flex-row gap-3 p-3 rounded-xl bg-gray-50/50 border border-gray-100">
                  <div className="w-full sm:w-24 flex-shrink-0">
                    <FileUpload value={reel.cover} onChange={(url) => updateReelItem(reel.id, { cover: url })} label="Обложка" />
                  </div>
                  <div className="flex-1 space-y-2">
                    <input type="text" value={reel.caption} onChange={e => updateReelItem(reel.id, { caption: e.target.value })} className={inputClass} placeholder="Подпись (например: Обзор 3-комнатной в центре)" />
                    <input type="text" value={reel.url} onChange={e => updateReelItem(reel.id, { url: e.target.value })} className={inputClass} placeholder="https://www.instagram.com/reel/..." />
                  </div>
                  <button onClick={() => removeReel(reel.id)} aria-label="Удалить" className="self-start p-2.5 rounded-xl text-red-500 bg-white border border-red-100 hover:bg-red-50 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <button onClick={addReel} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-emerald-800 bg-emerald-50 border border-emerald-100 hover:bg-emerald-100 transition-colors">
                <Plus className="w-4 h-4" /> Добавить рилс
              </button>
            </div>
          </div>

          {/* SEO Global */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2"><Globe className="w-5 h-5" /> SEO — Глобальные настройки</h2>
            <div className="space-y-4">
              <div><label className={labelClass}>Meta Title (отображается в Google)</label><input type="text" value={form.metaTitle} onChange={e => setForm(p => ({ ...p, metaTitle: e.target.value }))} className={inputClass} maxLength={70} /></div>
              <div><label className={labelClass}>Meta Description (описание в поиске)</label><textarea value={form.metaDescription} onChange={e => setForm(p => ({ ...p, metaDescription: e.target.value }))} rows={3} className={`${inputClass} resize-none`} maxLength={160} /></div>
              <div className="flex gap-3 text-xs text-gray-500">
                <span className="px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-100">{form.metaTitle.length}/70 символов</span>
                <span className="px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-100">{form.metaDescription.length}/160 символов</span>
              </div>
            </div>
          </div>

          {/* SEO Per Page */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2"><FileText className="w-5 h-5" /> SEO — Настройки страниц</h2>
            <div className="space-y-4">
              {pages.map(({ key, label }) => (
                <div key={key} className="p-4 rounded-xl bg-gray-50/50 border border-gray-100">
                  <div className="text-sm font-bold text-gray-800 mb-3">{label}</div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Title</label>
                      <input type="text" value={form.pageSeo[key].title} onChange={e => updatePageSeo(key, 'title', e.target.value)} className={inputClass} />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">H1</label>
                      <input type="text" value={form.pageSeo[key].h1} onChange={e => updatePageSeo(key, 'h1', e.target.value)} className={inputClass} />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Description</label>
                      <input type="text" value={form.pageSeo[key].description} onChange={e => updatePageSeo(key, 'description', e.target.value)} className={inputClass} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <TwoFactorSettings />

          {/* Reset */}
          <div className="bg-red-50 rounded-2xl border border-red-100 p-6">
            <h2 className="text-lg font-bold text-red-800 mb-2 flex items-center gap-2"><AlertTriangle className="w-5 h-5" /> Сброс настроек</h2>
            <p className="text-sm text-red-600 mb-4">Вернёт все настройки к значениям по умолчанию. Необратимо.</p>
            {!showReset ? (
              <button onClick={() => setShowReset(true)} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-red-600 bg-white border border-red-200 hover:bg-red-100 transition-colors">
                <RotateCcw className="w-4 h-4" /> Сбросить всё
              </button>
            ) : (
              <div className="flex items-center gap-3">
                <button onClick={handleReset} className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-red-500 hover:bg-red-600 transition-colors">Да, сбросить</button>
                <button onClick={() => setShowReset(false)} className="px-5 py-2.5 rounded-xl text-sm font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-50">Отмена</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
