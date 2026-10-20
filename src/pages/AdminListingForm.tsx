import { useState, useRef, useCallback } from 'react';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '../../api/router';
import { useParams, useNavigate } from 'react-router-dom';
import AdminLayout from '@/components/AdminLayout';
import {
  ArrowLeft, Save, Building2, MapPin, DollarSign, BedDouble, Square, Layers, Tag,
  Search, X, ImageIcon, Sparkles,
} from 'lucide-react';
import { trpc } from '@/providers/trpc';
import { compressImage } from '../components/FileUpload';

/** Yandex: ...?ll=68.78,38.573... / Google: .../@38.573,68.78,15z — both put
 * lon/lat straight in the URL for a full link. Short share-links (yandex.ru/…
 * без /-/ и координат) can't be parsed client-side without following the
 * redirect, so this intentionally returns null for those. */
function parseCoordsFromMapLink(url: string): { lat: number; lng: number } | null {
  if (!url) return null;
  try {
    const decoded = decodeURIComponent(url);
    const yandex = decoded.match(/[?&]ll=(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);
    if (yandex) return { lng: parseFloat(yandex[1]), lat: parseFloat(yandex[2]) };
    const google = decoded.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (google) return { lat: parseFloat(google[1]), lng: parseFloat(google[2]) };
  } catch {
    // malformed URL — fall through to the address-search field instead
  }
  return null;
}

const emptyForm = {
  title: '', location: '', price: '', rooms: '2', area: '', floor: '', totalFloors: '',
  type: '' as '' | 'Новостройки' | 'Вторичка', stage: '', repair: '',
  urgent: false, description: '', seoDesc: '', images: [] as string[],
  mapLink: '', district: '', balcony: '', bathroom: '', ceilingHeight: '', windows: '',
  heating: '', elevator: '', parking: '', security: '', yearBuilt: '', material: '',
  internet: '', furniture: '', appliances: '', metaTitle: '', metaDescription: '', h1: '',
  instagramUrl: '',
};

const DETAIL_KEYS = [
  'district', 'balcony', 'bathroom', 'ceilingHeight', 'windows', 'heating',
  'elevator', 'parking', 'security', 'yearBuilt', 'material', 'internet',
  'furniture', 'appliances',
] as const;

export default function AdminListingForm() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEdit = !!id;
  const listingId = id ? Number(id) : 0;
  const validId = Number.isSafeInteger(listingId) && listingId > 0;
  const existingQuery = trpc.listing.getById.useQuery(
    { id: listingId },
    { enabled: isEdit && validId }
  );

  if (isEdit && validId && existingQuery.isLoading) {
    return (
      <AdminLayout>
        <div className="p-12 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-emerald-800 border-t-transparent rounded-full animate-spin" />
        </div>
      </AdminLayout>
    );
  }
  if (isEdit && (!validId || !existingQuery.data)) {
    return (
      <AdminLayout>
        <div className="p-8">
          <h1 className="text-xl font-bold">Не удалось открыть объект</h1>
          <p className="mt-2 text-sm text-gray-500">Объект не найден или соединение временно недоступно.</p>
          <button type="button" onClick={() => navigate('/admin/listings')} className="mt-4 text-emerald-800">Вернуться к списку</button>
        </div>
      </AdminLayout>
    );
  }
  // Same ID keeps the editor mounted through background refetches. A different
  // ID/new route gets a fresh form; new server data never replaces local edits.
  return <ListingEditor key={id ?? 'new'} listingId={listingId} initialListing={isEdit ? existingQuery.data : undefined} />;
}

type ExistingListing = inferRouterOutputs<AppRouter>['listing']['getById'];

function ListingEditor({ listingId, initialListing }: { listingId: number; initialListing?: ExistingListing }) {
  const navigate = useNavigate();
  const isEdit = listingId > 0;
  const utils = trpc.useUtils();
  const createMutation = trpc.listing.create.useMutation();
  const updateMutation = trpc.listing.update.useMutation();
  const generateDesc = trpc.ai.generateDescription.useMutation();

  const [form, setForm] = useState(() => {
    const existing = initialListing;
    if (!existing) return { ...emptyForm, images: [] };
    const details = existing.details ?? {};
    return {
      title: existing.title, location: existing.location,
      price: existing.price.toString(), rooms: existing.rooms.toString(),
      area: existing.area.toString(), floor: existing.floor ?? '',
      totalFloors: existing.totalFloors?.toString() ?? '',
      type: (existing.type ?? '') as typeof emptyForm.type,
      stage: existing.stage ?? '', repair: existing.repair ?? '',
      urgent: existing.urgent, description: existing.description ?? '',
      seoDesc: existing.seoDesc ?? '',
      images: [...(existing.imageUrls ?? [])], mapLink: existing.mapAddress ?? '',
      district: details.district ?? '', balcony: details.balcony ?? '',
      bathroom: details.bathroom ?? '', ceilingHeight: details.ceilingHeight ?? '',
      windows: details.windows ?? '', heating: details.heating ?? '',
      elevator: details.elevator ?? '', parking: details.parking ?? '',
      security: details.security ?? '', yearBuilt: details.yearBuilt ?? '',
      material: details.material ?? '', internet: details.internet ?? '',
      furniture: details.furniture ?? '', appliances: details.appliances ?? '',
      metaTitle: existing.metaTitle ?? existing.title,
      metaDescription: existing.metaDescription ?? existing.seoDesc ?? '',
      h1: existing.h1 ?? existing.title,
      instagramUrl: existing.instagramUrl ?? '',
    };
  });
  const [mapQuery, setMapQuery] = useState(() => initialListing?.location ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.title.trim()) e.title = 'Введите название';
    if (!form.location.trim()) e.location = 'Введите адрес';
    if (!form.price || parseInt(form.price) <= 0) e.price = 'Цена должна быть больше 0';
    if (!form.area || parseInt(form.area) <= 0) e.area = 'Площадь должна быть больше 0';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const buildPayload = () => {
    const details: Record<string, string> = {};
    for (const key of DETAIL_KEYS) {
      if (form[key]) details[key] = form[key];
    }
    return {
      title: form.title,
      location: form.location,
      price: parseInt(form.price.toString().replace(/\s/g, '')),
      rooms: parseInt(form.rooms),
      area: parseInt(form.area),
      floor: form.floor || undefined,
      totalFloors: form.totalFloors ? parseInt(form.totalFloors) : undefined,
      type: form.type || null,
      stage: form.stage || null,
      repair: form.repair || null,
      urgent: form.urgent,
      images: form.images.length || undefined,
      imageUrls: form.images,
      description: form.description || undefined,
      seoDesc: form.seoDesc || undefined,
      details,
      mapAddress: form.mapLink || undefined,
      instagramUrl: form.instagramUrl || undefined,
      metaTitle: form.metaTitle || undefined,
      metaDescription: form.metaDescription || undefined,
      h1: form.h1 || undefined,
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSaveError('');
    try {
      const payload = buildPayload();
      if (isEdit) {
        await updateMutation.mutateAsync({ id: listingId, ...payload });
      } else {
        await createMutation.mutateAsync(payload);
      }
      await utils.listing.invalidate();
      navigate('/admin/listings');
    } catch {
      setSaveError('Не удалось сохранить. Проверьте соединение и попробуйте ещё раз.');
    }
  };

  const handleGenerateDescription = async () => {
    if (!validate()) return;
    try {
      const result = await generateDesc.mutateAsync({
        title: form.title,
        location: form.location,
        price: parseInt(form.price),
        rooms: parseInt(form.rooms),
        area: parseInt(form.area),
        floor: form.floor || undefined,
        type: form.type || null,
        repair: form.repair || undefined,
        district: form.district || undefined,
        details: Object.fromEntries(DETAIL_KEYS.filter(k => form[k]).map(k => [k, form[k]])),
      });
      setForm(p => ({
        ...p,
        description: result.description,
        seoDesc: result.seoDescription,
        // Кнопка «генерировать SEO» — заполняет весь набор целиком, а не «если пусто»:
        // смысл в том, чтобы одним кликом получить лучший SEO от ИИ.
        metaTitle: result.metaTitle ?? p.metaTitle,
        metaDescription: result.metaDescription ?? result.seoDescription,
        h1: result.h1 ?? p.h1,
      }));
    } catch {
      alert('Не удалось сгенерировать описание. Попробуйте ещё раз.');
    }
  };

  const processFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    const newImages: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size > 5 * 1024 * 1024) { alert(`Файл ${file.name} слишком большой (>5MB)`); continue; }
      try {
        const compressed = await compressImage(file, 1200, 0.8);
        const { url } = await utils.client.upload.create.mutate({ dataUrl: compressed });
        newImages.push(url);
      } catch { alert(`Ошибка при загрузке ${file.name}`); }
    }
    setForm(p => ({ ...p, images: [...p.images, ...newImages] }));
    setUploading(false);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    processFiles(e.dataTransfer.files);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRemoveImage = (idx: number) => {
    const next = [...form.images];
    next.splice(idx, 1);
    setForm(p => ({ ...p, images: next }));
  };

  // Раньше "Ссылка на карту" сохранялась в объект, но никак не влияла на
  // превью ниже — только отдельное поле поиска по адресу двигало карту.
  // Достаём координаты прямо из вставленной ссылки (Yandex ?ll=.. / Google
  // @lat,lng) — надёжнее текстового поиска, если ссылка полная (не короткая
  // yandex.ru/short-ссылка — там координат в самом URL нет).
  const mapLinkCoords = parseCoordsFromMapLink(form.mapLink);
  const mapSrc = mapLinkCoords
    ? `https://yandex.com/map-widget/v1/?z=16&ll=${mapLinkCoords.lng},${mapLinkCoords.lat}&pt=${mapLinkCoords.lng},${mapLinkCoords.lat}`
    : mapQuery
    ? `https://yandex.com/map-widget/v1/?z=16&text=${encodeURIComponent(mapQuery)}`
    : 'https://yandex.com/map-widget/v1/?z=12&ll=68.7790,38.5733';

  const inputClass = 'w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-800/30 transition-all';
  const labelClass = 'flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2';
  const errorClass = 'text-xs text-red-500 mt-1';

  const saving = createMutation.isPending || updateMutation.isPending;

  return (
    <AdminLayout>
      <div className="p-4 lg:p-8 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button onClick={() => navigate('/admin/listings')} className="p-2 rounded-xl hover:bg-gray-100 text-gray-500 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{isEdit ? 'Редактировать объект' : 'Новый объект'}</h1>
            <p className="text-sm text-gray-500 mt-0.5">{isEdit ? `ID: ${listingId}` : 'Заполните все обязательные поля'}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Main info */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Основная информация</h2>
            <div className="space-y-4">
              <div>
                <label className={labelClass}><Tag className="w-4 h-4" /> Название *</label>
                <input type="text" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="Например: 3-комнатная квартира 115 м² с евроремонтом" className={inputClass} />
                {errors.title && <p className={errorClass}>{errors.title}</p>}
              </div>
              <div>
                <label className={labelClass}><MapPin className="w-4 h-4" /> Адрес *</label>
                <input type="text" value={form.location} onChange={e => setForm(p => ({ ...p, location: e.target.value }))} placeholder="Душанбе, р-н Шохмансур, ул. Шохина, 25" className={inputClass} />
                {errors.location && <p className={errorClass}>{errors.location}</p>}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}><DollarSign className="w-4 h-4" /> Цена (сомони) *</label>
                  <input type="number" value={form.price} onChange={e => setForm(p => ({ ...p, price: e.target.value }))} placeholder="1650000" className={inputClass} />
                  {errors.price && <p className={errorClass}>{errors.price}</p>}
                </div>
                <div>
                  <label className={labelClass}><BedDouble className="w-4 h-4" /> Комнаты *</label>
                  <select value={form.rooms} onChange={e => setForm(p => ({ ...p, rooms: e.target.value }))} className={inputClass}>
                    <option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option><option value="5">5+</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className={labelClass}><Square className="w-4 h-4" /> Площадь (м²) *</label>
                  <input type="number" value={form.area} onChange={e => setForm(p => ({ ...p, area: e.target.value }))} placeholder="115" className={inputClass} />
                  {errors.area && <p className={errorClass}>{errors.area}</p>}
                </div>
                <div>
                  <label className={labelClass}><Layers className="w-4 h-4" /> Этаж</label>
                  <input type="text" value={form.floor} onChange={e => setForm(p => ({ ...p, floor: e.target.value }))} placeholder="14/18" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}><Building2 className="w-4 h-4" /> Всего этажей</label>
                  <input type="number" value={form.totalFloors} onChange={e => setForm(p => ({ ...p, totalFloors: e.target.value }))} placeholder="18" className={inputClass} />
                </div>
              </div>
            </div>
          </div>

          {/* SEO */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2"><Tag className="w-5 h-5" /> SEO</h2>
            <div className="space-y-4">
              <div>
                <label className={labelClass}>Meta Title</label>
                <input type="text" value={form.metaTitle} onChange={e => setForm(p => ({ ...p, metaTitle: e.target.value }))} placeholder="Meta title для Google..." maxLength={70} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Meta Description</label>
                <textarea value={form.metaDescription} onChange={e => setForm(p => ({ ...p, metaDescription: e.target.value }))} placeholder="SEO-описание для поисковых систем..." rows={2} maxLength={160} className={`${inputClass} resize-none`} />
              </div>
              <div>
                <label className={labelClass}>H1 заголовок</label>
                <input type="text" value={form.h1} onChange={e => setForm(p => ({ ...p, h1: e.target.value }))} placeholder="Заголовок H1..." className={inputClass} />
              </div>
            </div>
          </div>

          {/* Map Link */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Расположение на карте</h2>
            <div className="space-y-4">
              <div>
                <label className={labelClass}>Ссылка на карту (Yandex / Google)</label>
                <input type="url" value={form.mapLink} onChange={e => setForm(p => ({ ...p, mapLink: e.target.value }))} placeholder="https://yandex.ru/maps/-/..." className={inputClass} />
                <p className="text-xs text-gray-400 mt-1.5">
                  {form.mapLink && !mapLinkCoords
                    ? 'Не нашли координаты в этой ссылке — короткие ссылки (yandex.ru/…) не подходят, вставьте полную ссылку с картой (со значком «Поделиться» → «Ссылка») или используйте поиск по адресу ниже.'
                    : 'Карта ниже обновится сама, если ссылка содержит координаты — иначе используйте поиск по адресу.'}
                </p>
              </div>
              <div className="flex gap-2">
                <input type="text" value={mapQuery} onChange={e => setMapQuery(e.target.value)} placeholder="Введите адрес для поиска..." className={`${inputClass} flex-1`} />
                <button type="button" onClick={() => setMapQuery(form.location)} className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 whitespace-nowrap" style={{ backgroundColor: '#1a4d3a' }}>
                  <Search className="w-4 h-4" /> Показать
                </button>
              </div>
              <div className="rounded-xl overflow-hidden border border-gray-100 h-64 bg-gray-100">
                <iframe src={mapSrc} width="100%" height="100%" frameBorder="0" allowFullScreen className="w-full h-full" title="Map preview" />
              </div>
            </div>
          </div>

          {/* Instagram video tour */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Instagram</h2>
            <div>
              <label className={labelClass}>Ссылка на видео-тур (Reel / пост)</label>
              <input type="url" value={form.instagramUrl} onChange={e => setForm(p => ({ ...p, instagramUrl: e.target.value }))} placeholder="https://www.instagram.com/reel/..." className={inputClass} />
            </div>
          </div>

          {/* Details */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Детали</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Тип</label>
                <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value as '' | 'Новостройки' | 'Вторичка' }))} className={inputClass}>
                  <option value="">Не указано</option><option value="Новостройки">Новостройки</option><option value="Вторичка">Вторичка</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Стадия</label>
                <select value={form.stage} onChange={e => setForm(p => ({ ...p, stage: e.target.value }))} className={inputClass}>
                  <option value="">Не указано</option>
                  {form.stage && !['Построен', 'Строится', 'На стадии котлована'].includes(form.stage) && <option value={form.stage}>{form.stage}</option>}
                  <option value="Построен">Построен</option><option value="Строится">Строится</option><option value="На стадии котлована">На стадии котлована</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Ремонт</label>
                <select value={form.repair} onChange={e => setForm(p => ({ ...p, repair: e.target.value }))} className={inputClass}>
                  <option value="">Не указано</option>
                  {form.repair && !['Новый ремонт', 'Евроремонт', 'Разрешён ремонт', 'Без ремонта'].includes(form.repair) && <option value={form.repair}>{form.repair}</option>}
                  <option value="Новый ремонт">Новый ремонт</option><option value="Евроремонт">Евроремонт</option><option value="Разрешён ремонт">Разрешён ремонт</option><option value="Без ремонта">Без ремонта</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Район</label>
                <select value={form.district} onChange={e => setForm(p => ({ ...p, district: e.target.value }))} className={inputClass}>
                  <option value="">— Выберите —</option>
                  <option value="Сино">Сино</option><option value="Шохмансур">Шохмансур</option><option value="Фирдавси">Фирдавси</option><option value="И. Сомони">И. Сомони</option><option value="Центр">Центр</option>
                </select>
              </div>
            </div>
            <div className="mt-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <div className={`w-11 h-6 rounded-full transition-colors relative ${form.urgent ? 'bg-red-500' : 'bg-gray-200'}`} onClick={() => setForm(p => ({ ...p, urgent: !p.urgent }))}>
                  <div className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all`} style={{ left: form.urgent ? '22px' : '2px' }} />
                </div>
                <span className="text-sm font-medium text-gray-700">Срочное объявление</span>
              </label>
            </div>
          </div>

          {/* Flat Details */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Детали квартиры</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {([
                { key: 'balcony', label: 'Балкон', opts: ['—','Балкон','Лоджия','Лоджия + балкон','2 лоджии','Терасса','Нет'] },
                { key: 'bathroom', label: 'Санузел', opts: ['—','Раздельный','Совмещённый','2+ санузла'] },
                { key: 'ceilingHeight', label: 'Высота потолков', opts: ['—','2.5 м','2.7 м','2.8 м','3.0 м','3.2 м+'] },
                { key: 'windows', label: 'Окна', opts: ['—','Пластиковые','Панорамные','Витражные','Деревянные'] },
                { key: 'heating', label: 'Отопление', opts: ['—','Автономное','Центральное','Электрическое','Нет'] },
                { key: 'elevator', label: 'Лифт', opts: ['—','1 лифт','2 лифта','Грузовой + пассажирский','Нет'] },
                { key: 'parking', label: 'Парковка', opts: ['—','Подземный паркинг','Надземный паркинг','Открытая парковка','Уличная парковка','Нет'] },
                { key: 'security', label: 'Безопасность', opts: ['—','Охрана, видеонаблюдение','Консьерж','Домофон','Закрытый двор','Нет'] },
                { key: 'yearBuilt', label: 'Год постройки', opts: ['—','2026','2025','2024','2023','2022','2020–2021','2015–2019','2010–2014','До 2010'] },
                { key: 'material', label: 'Материал дома', opts: ['—','Монолитный каркас','Кирпич','Панель','Блочный','Саман'] },
                { key: 'internet', label: 'Интернет', opts: ['—','Оптоволокно','DSL','4G/5G роутер','Нет'] },
                { key: 'furniture', label: 'Мебель', opts: ['—','Полностью','Частично','Без мебели'] },
                { key: 'appliances', label: 'Бытовая техника', opts: ['—','Встроенная техника','Премиум техника','Smart Home','Без техники'] },
              ] as const).map(({ key, label, opts }) => (
                <div key={key}>
                  <label className={labelClass}>{label}</label>
                  <select value={form[key] || ''} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} className={inputClass}>
                    {opts.map(o => <option key={o} value={o === '—' ? '' : o}>{o}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>

          {/* Photos — drag & drop multiple */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Фотографии</h2>
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-xl p-6 mb-4 transition-all ${dragOver ? 'border-emerald-400 bg-emerald-50' : 'border-gray-200 bg-gray-50 hover:border-gray-300'}`}
            >
              <div className="text-center">
                {uploading ? (
                  <div className="w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                ) : (
                  <>
                    <ImageIcon className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-500 font-medium">Перетащите фото сюда или <button type="button" onClick={() => fileInputRef.current?.click()} className="text-emerald-600 hover:underline">выберите файлы</button></p>
                    <p className="text-[10px] text-gray-400 mt-1">JPEG, PNG до 5 МБ каждый</p>
                  </>
                )}
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={e => processFiles(e.target.files)} className="hidden" />
            </div>
            {form.images.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {form.images.map((img, idx) => (
                  <div key={idx} className="relative rounded-xl overflow-hidden border border-gray-100 bg-gray-50 group">
                    <img src={img} alt="" className="w-full h-28 object-cover" />
                    <button
                      type="button"
                      onClick={() => handleRemoveImage(idx)}
                      className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-white/90 shadow flex items-center justify-center text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                    {idx === 0 && (
                      <div className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-bold">
                        Главное фото
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Description */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">Описание</h2>
              <button
                type="button"
                onClick={handleGenerateDescription}
                disabled={generateDesc.isPending}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 transition-colors disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4" />
                {generateDesc.isPending ? 'Генерация...' : 'Сгенерировать SEO и описание'}
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className={labelClass}>Описание</label>
                <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Подробное описание объекта... (или нажмите «Сгенерировать описание»)" rows={5} className={`${inputClass} resize-none`} />
              </div>
              <div>
                <label className={labelClass}>SEO описание</label>
                <textarea value={form.seoDesc} onChange={e => setForm(p => ({ ...p, seoDesc: e.target.value }))} placeholder="SEO-описание для поисковых систем..." rows={2} className={`${inputClass} resize-none`} />
              </div>
            </div>
          </div>

          {saveError && (
            <div className="px-4 py-3 rounded-xl bg-red-50 text-red-600 text-sm font-medium">
              {saveError}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3">
            <button type="button" onClick={() => navigate('/admin/listings')} className="px-6 py-3 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-100 transition-colors">
              Отмена
            </button>
            <button
              type="submit"
              disabled={saving || uploading}
              className="flex items-center gap-2 px-8 py-3 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: '#1a4d3a' }}
            >
              <Save className="w-4 h-4" /> {saving ? 'Сохранение...' : isEdit ? 'Сохранить' : 'Создать объект'}
            </button>
          </div>
        </form>
      </div>
    </AdminLayout>
  );
}
