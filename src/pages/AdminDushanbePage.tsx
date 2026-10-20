import { useState } from 'react';
import { useCms } from '@/contexts/CmsContext';
import AdminLayout from '@/components/AdminLayout';
import FileUpload from '@/components/FileUpload';
import { Save, Type, Phone, List } from 'lucide-react';

export default function AdminDushanbePage() {
  const { cms, updateDushanbeBanner } = useCms();
  const [form, setForm] = useState(cms.dushanbeBanner);
  const [saved, setSaved] = useState(false);

  const handleSave = () => { updateDushanbeBanner(form); setSaved(true); setTimeout(() => setSaved(false), 2000); };
  const inputClass = 'w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-800/30 transition-all';
  const labelClass = 'flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2';

  return (
    <AdminLayout>
      <div className="p-4 lg:p-8 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div><h1 className="text-2xl font-bold text-gray-900">Баннер Душанбе</h1><p className="text-sm text-gray-500 mt-1">CTA-баннер с фото города</p></div>
          <button onClick={handleSave} className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90" style={{ backgroundColor: '#1a4d3a' }}>
            <Save className="w-4 h-4" /> {saved ? 'Сохранено!' : 'Сохранить'}
          </button>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-gray-100 p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2"><Type className="w-5 h-5" /> Текст</h2>
              <div className="space-y-4">
                <div><label className={labelClass}>Заголовок</label><input type="text" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} className={inputClass} /></div>
                <div><label className={labelClass}>Подзаголовок</label><textarea value={form.subtitle} onChange={e => setForm(p => ({ ...p, subtitle: e.target.value }))} rows={2} className={`${inputClass} resize-none`} /></div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2"><Phone className="w-5 h-5" /> Форма</h2>
              <div className="grid grid-cols-2 gap-4">
                <div><label className={labelClass}>Placeholder</label><input type="text" value={form.phonePlaceholder} onChange={e => setForm(p => ({ ...p, phonePlaceholder: e.target.value }))} className={inputClass} /></div>
                <div><label className={labelClass}>Текст кнопки</label><input type="text" value={form.ctaText} onChange={e => setForm(p => ({ ...p, ctaText: e.target.value }))} className={inputClass} /></div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2"><List className="w-5 h-5" /> Преимущества</h2>
              <div className="space-y-2.5">
                {form.features.map((f, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center text-xs font-bold text-emerald-700">{i + 1}</span>
                    <input type="text" value={f} onChange={e => { const n = [...form.features]; n[i] = e.target.value; setForm(p => ({ ...p, features: n })); }} className={`${inputClass} flex-1`} />
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 p-6">
              <FileUpload value={form.bgImage} onChange={url => setForm(p => ({ ...p, bgImage: url }))} label="Фоновое фото Душанбе" />
            </div>
          </div>

          <div className="lg:sticky lg:top-6 h-fit">
            <div className="bg-white rounded-2xl border border-gray-100 p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Предпросмотр</h2>
              <div className="rounded-2xl overflow-hidden relative">
                <div className="flex flex-col lg:flex-row min-h-[280px]">
                  <div className="flex-1 p-5" style={{ background: 'linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 30%, #a5d6a7 60%, #ffffff 100%)' }}>
                    <h2 className="text-lg font-bold text-gray-900 mb-2">{form.title}</h2>
                    <p className="text-xs text-gray-600 mb-3">{form.subtitle}</p>
                    <div className="flex gap-2 mb-3">
                      <span className="px-3 py-1.5 rounded-lg text-[10px] bg-white/60">{form.phonePlaceholder}</span>
                      <span className="px-3 py-1.5 rounded-lg text-[10px] font-bold" style={{ backgroundColor: '#c9a84c' }}>{form.ctaText}</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {form.features.map((f, i) => <span key={i} className="text-[9px] text-gray-600">{f}</span>)}
                    </div>
                  </div>
                  {form.bgImage && <div className="lg:w-[55%] min-h-[120px]"><img src={form.bgImage.startsWith('local:') ? undefined : form.bgImage} alt="" className="w-full h-full object-cover" /></div>}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
