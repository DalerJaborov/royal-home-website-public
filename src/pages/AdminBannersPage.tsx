import { useState } from 'react';
import { useCms } from '@/contexts/CmsContext';
import AdminLayout from '@/components/AdminLayout';
import FileUpload from '@/components/FileUpload';
import { Save } from 'lucide-react';

const inputClass = 'w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-800/30 transition-all';
const labelClass = 'text-xs text-gray-500 mb-1.5 block';

interface BannerCardProps {
  title: string;
  desc: string;
  image: string;
  color: string;
  label: string;
  onTitle: (v: string) => void;
  onDesc: (v: string) => void;
  onImage: (v: string) => void;
  onColor: (v: string) => void;
}

/**
 * На уровне модуля, а не внутри AdminBannersPage: объявленный в теле компонента,
 * он пересоздавался как НОВЫЙ тип на каждый рендер, поэтому React размонтировал
 * и монтировал заново все три карточки при каждом нажатии клавиши — поле ввода
 * теряло фокус после каждого символа. Заодно ушёл тип `any` на всех девяти пропсах.
 */
function BannerCard({ title, desc, image, color, onTitle, onDesc, onImage, onColor, label }: BannerCardProps) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold" style={{ background: color }}>{label[0]}</div>
        <h3 className="font-bold text-gray-900">{label}</h3>
      </div>
      <div className="space-y-3">
        <div><label className={labelClass}>Заголовок</label><input type="text" value={title} onChange={e => onTitle(e.target.value)} className={inputClass} /></div>
        <div><label className={labelClass}>Описание</label><input type="text" value={desc} onChange={e => onDesc(e.target.value)} className={inputClass} /></div>
        <div>
          <label className={labelClass}>Цвет фона</label>
          <input type="text" value={color} onChange={e => onColor(e.target.value)} className={inputClass} placeholder="linear-gradient(...) или #hex" />
          <div className="flex gap-2 mt-2">
            {['#1a4d3a', '#c9a84c', '#2563eb', '#dc2626', '#7c3aed', '#0e7490', '#000000'].map(c => (
              <button key={c} onClick={() => onColor(c)} className="w-7 h-7 rounded-lg border border-gray-200 shadow-sm" style={{ background: c }} />
            ))}
          </div>
        </div>
        <FileUpload value={image} onChange={onImage} label="3D изображение" />
      </div>
    </div>
  );
}

export default function AdminBannersPage() {
  const { cms, updateBanners } = useCms();
  const [form, setForm] = useState(cms.banners);
  const [saved, setSaved] = useState(false);

  const handleSave = () => { updateBanners(form); setSaved(true); setTimeout(() => setSaved(false), 2000); };

  return (
    <AdminLayout>
      <div className="p-4 lg:p-8 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div><h1 className="text-2xl font-bold text-gray-900">3D Баннеры</h1><p className="text-sm text-gray-500 mt-1">3 промо-карточки на главной</p></div>
          <button onClick={handleSave} className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90" style={{ backgroundColor: '#1a4d3a' }}>
            <Save className="w-4 h-4" /> {saved ? 'Сохранено!' : 'Сохранить'}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <BannerCard title={form.newBuildingsTitle} desc={form.newBuildingsDesc} image={form.newBuildingsImage} color={form.newBuildingsColor}
            onTitle={(v: string) => setForm(p => ({ ...p, newBuildingsTitle: v }))} onDesc={(v: string) => setForm(p => ({ ...p, newBuildingsDesc: v }))}
            onImage={(v: string) => setForm(p => ({ ...p, newBuildingsImage: v }))} onColor={(v: string) => setForm(p => ({ ...p, newBuildingsColor: v }))} label="Новостройки" />
          <BannerCard title={form.mortgageTitle} desc={form.mortgageDesc} image={form.mortgageImage} color={form.mortgageColor}
            onTitle={(v: string) => setForm(p => ({ ...p, mortgageTitle: v }))} onDesc={(v: string) => setForm(p => ({ ...p, mortgageDesc: v }))}
            onImage={(v: string) => setForm(p => ({ ...p, mortgageImage: v }))} onColor={(v: string) => setForm(p => ({ ...p, mortgageColor: v }))} label="Ипотека" />
          <BannerCard title={form.evaluationTitle} desc={form.evaluationDesc} image={form.evaluationImage} color={form.evaluationColor}
            onTitle={(v: string) => setForm(p => ({ ...p, evaluationTitle: v }))} onDesc={(v: string) => setForm(p => ({ ...p, evaluationDesc: v }))}
            onImage={(v: string) => setForm(p => ({ ...p, evaluationImage: v }))} onColor={(v: string) => setForm(p => ({ ...p, evaluationColor: v }))} label="Оценка" />
        </div>
      </div>
    </AdminLayout>
  );
}
