import { useState } from 'react';
import { useCms } from '@/contexts/CmsContext';
import AdminLayout from '@/components/AdminLayout';
import FileUpload from '@/components/FileUpload';
import { Save, Eye, EyeOff } from 'lucide-react';

export default function AdminServicesPage() {
  const { cms, updateServices } = useCms();
  const [services, setServices] = useState(cms.services);
  const [saved, setSaved] = useState(false);

  const handleSave = () => { updateServices(services); setSaved(true); setTimeout(() => setSaved(false), 2000); };
  const toggleActive = (id: number) => setServices(prev => prev.map(s => s.id === id ? { ...s, active: !s.active } : s));
  const updateField = (id: number, field: 'title' | 'desc' | 'image', value: string) => setServices(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));

  const inputClass = 'w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-800/30 transition-all';
  const labelClass = 'text-xs text-gray-500 mb-1.5 block';

  return (
    <AdminLayout>
      <div className="p-4 lg:p-8 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div><h1 className="text-2xl font-bold text-gray-900">Услуги</h1><p className="text-sm text-gray-500 mt-1">{services.filter(s => s.active).length} активных из {services.length}</p></div>
          <button onClick={handleSave} className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90" style={{ backgroundColor: '#1a4d3a' }}>
            <Save className="w-4 h-4" /> {saved ? 'Сохранено!' : 'Сохранить'}
          </button>
        </div>

        <div className="space-y-4">
          {services.map((s, i) => (
            <div key={s.id} className={`bg-white rounded-2xl border p-6 transition-all ${s.active ? 'border-gray-100' : 'border-gray-200 opacity-50'}`}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: '#1a4d3a' }}>{i + 1}</span>
                  <h3 className="font-bold text-gray-900">{s.title || 'Новая услуга'}</h3>
                  {!s.active && <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-200 text-gray-500">Скрыта</span>}
                </div>
                <button onClick={() => toggleActive(s.id)} className={`p-2 rounded-lg transition-colors ${s.active ? 'text-emerald-600 hover:bg-emerald-50' : 'text-gray-400 hover:bg-gray-100'}`}>
                  {s.active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2 space-y-3">
                  <div><label className={labelClass}>Название</label><input type="text" value={s.title} onChange={e => updateField(s.id, 'title', e.target.value)} className={inputClass} /></div>
                  <div><label className={labelClass}>Описание</label><input type="text" value={s.desc} onChange={e => updateField(s.id, 'desc', e.target.value)} className={inputClass} /></div>
                </div>
                <div>
                  <FileUpload value={s.image} onChange={url => updateField(s.id, 'image', url)} label="Изображение" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AdminLayout>
  );
}
