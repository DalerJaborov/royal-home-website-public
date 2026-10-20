import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2, Search, Eye, Pencil, Trash2, MapPin, BedDouble, Square, Plus,
  ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown,
  UploadCloud, DownloadCloud, Loader2,
} from 'lucide-react';
import { trpc } from '@/providers/trpc';
import { getDistrictName } from '@/data/listings';
import AdminLayout from '@/components/AdminLayout';

type SortKey = 'price' | 'date' | 'area';
type SortDir = 'asc' | 'desc';

/** На уровне модуля, а не в теле страницы: объявленный внутри, он был новым типом
 *  компонента на каждый рендер, и React перемонтировал заголовки таблицы при любом
 *  изменении фильтров или страницы. Состояние сортировки приходит пропсами. */
function SortIcon({ k, sortKey, sortDir }: { k: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (sortKey !== k) return <ArrowUpDown className="w-3 h-3 text-gray-300" />;
  return sortDir === 'asc' ? <ArrowUp className="w-3 h-3 text-emerald-600" /> : <ArrowDown className="w-3 h-3 text-emerald-600" />;
}

export default function AdminListingsPage() {
  const utils = trpc.useUtils();
  const { data: listings, isLoading } = trpc.listing.list.useQuery({
    includeUnpublished: true,
    includeAllCategories: true,
  });
  const deleteMutation = trpc.listing.delete.useMutation({
    onSuccess: () => utils.listing.list.invalidate(),
  });
  const exportMutation = trpc.listing.exportToSheet.useMutation({
    onSuccess: (r) => alert(`Готово: ${r.count} объектов выгружено в Google Sheets.`),
    onError: (e) => alert(`Не удалось выгрузить: ${e.message}`),
  });
  const importMutation = trpc.listing.importFromSheet.useMutation({
    onSuccess: (r) => {
      utils.listing.list.invalidate();
      setImportPreview(null);
      const errLine = r.errors.length ? `\nОшибки (${r.errors.length}): ${r.errors.slice(0, 5).join('; ')}` : '';
      alert(`Готово: создано ${r.created}, обновлено ${r.updated} из ${r.total} строк.${errLine}`);
    },
    onError: (e) => alert(`Не удалось загрузить: ${e.message}`),
  });
  // Сухой прогон: узнаём, что произойдёт, и показываем в окне подтверждения.
  const previewMutation = trpc.listing.previewImport.useMutation({
    onSuccess: (r) => setImportPreview(r),
    onError: (e) => alert(`Не удалось прочитать таблицу: ${e.message}`),
  });
  const [importPreview, setImportPreview] = useState<{
    total: number; toCreate: number; toUpdate: number; createTitles: string[]; updateTitles: string[];
  } | null>(null);
  const [showExportConfirm, setShowExportConfirm] = useState(false);

  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'Новостройки' | 'Вторичка'>('all');
  const [filterDistrict, setFilterDistrict] = useState('');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(1);
  const perPage = 10;

  const all = listings ?? [];

  // Через getDistrictName: раньше бралась «вторая часть» адреса, а у объектов из
  // CRM там стоит город — список районов для фильтра состоял из одного «Душанбе».
  const districts = Array.from(new Set(all.map(l => getDistrictName(l.location, l.location))));

  const filtered = all.filter(l => {
    const s = search.toLowerCase();
    const matchesSearch = !s || l.title.toLowerCase().includes(s) || l.location.toLowerCase().includes(s);
    const matchesType = filterType === 'all' || l.type === filterType;
    const matchesDistrict = !filterDistrict || l.location.includes(filterDistrict);
    const matchesPrice = (!priceMin || l.price >= parseInt(priceMin)) && (!priceMax || l.price <= parseInt(priceMax));
    return matchesSearch && matchesType && matchesDistrict && matchesPrice;
  }).sort((a, b) => {
    let cmp = 0;
    if (sortKey === 'price') cmp = a.price - b.price;
    else if (sortKey === 'area') cmp = a.area - b.area;
    else cmp = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const currentPage = Math.min(page, totalPages);
  const paged = filtered.slice((currentPage - 1) * perPage, currentPage * perPage);

  const handleDelete = (id: number) => {
    if (!confirm('Удалить объект? Это действие нельзя отменить.')) return;
    deleteMutation.mutate({ id });
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
    setPage(1);
  };

  return (
    <AdminLayout>
      <div className="p-4 lg:p-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Объекты недвижимости</h1>
            <p className="text-sm text-gray-500 mt-1">{filtered.length} из {all.length} объектов</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => previewMutation.mutate()}
              disabled={previewMutation.isPending || importMutation.isPending}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50"
              title="Импорт из Google Sheets — сначала покажем, что изменится"
            >
              {previewMutation.isPending || importMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
              Импорт из Sheets
            </button>
            <button
              onClick={() => setShowExportConfirm(true)}
              disabled={exportMutation.isPending}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50"
              title="Экспорт в Google Sheets"
            >
              {exportMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <DownloadCloud className="w-4 h-4" />}
              Экспорт в Sheets
            </button>
            <Link
              to="/admin/listings/new"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90"
              style={{ backgroundColor: '#1a4d3a' }}
            >
              <Plus className="w-4 h-4" /> Добавить объект
            </Link>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-4">
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                placeholder="Поиск по названию или адресу..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-800/30"
              />
            </div>
            <select
              value={filterType}
              // Значение сверяется с закрытым набором, а не приводится через any:
              // опечатка в <option> тихо давала фильтр, который ничего не находит.
              onChange={e => {
                const v = e.target.value;
                setFilterType(v === 'Новостройки' || v === 'Вторичка' ? v : 'all');
                setPage(1);
              }}
              className="px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm appearance-none cursor-pointer"
            >
              <option value="all">Все типы</option>
              <option value="Новостройки">Новостройки</option>
              <option value="Вторичка">Вторичка</option>
            </select>
            <select
              value={filterDistrict}
              onChange={e => { setFilterDistrict(e.target.value); setPage(1); }}
              className="px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm appearance-none cursor-pointer"
            >
              <option value="">Все районы</option>
              {districts.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <div className="flex gap-2">
              <input
                type="number"
                value={priceMin}
                onChange={e => { setPriceMin(e.target.value); setPage(1); }}
                placeholder="Цена от"
                className="w-28 px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-800/30"
              />
              <input
                type="number"
                value={priceMax}
                onChange={e => { setPriceMax(e.target.value); setPage(1); }}
                placeholder="Цена до"
                className="w-28 px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-800/30"
              />
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          {isLoading ? (
            <div className="p-12 flex items-center justify-center">
              <div className="w-8 h-8 border-2 border-emerald-800 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center">
              <Building2 className="w-12 h-12 text-gray-200 mx-auto mb-3" />
              <p className="text-gray-500">Объекты не найдены</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Объект</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">Район</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 cursor-pointer select-none" onClick={() => handleSort('price')}>
                      <span className="flex items-center gap-1">Цена <SortIcon k="price" sortKey={sortKey} sortDir={sortDir} /></span>
                    </th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden sm:table-cell cursor-pointer select-none" onClick={() => handleSort('area')}>
                      <span className="flex items-center gap-1">Параметры <SortIcon k="area" sortKey={sortKey} sortDir={sortDir} /></span>
                    </th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden lg:table-cell cursor-pointer select-none" onClick={() => handleSort('date')}>
                      <span className="flex items-center gap-1">Дата <SortIcon k="date" sortKey={sortKey} sortDir={sortDir} /></span>
                    </th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((l) => (
                    <tr key={l.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-xl bg-gray-100 flex-shrink-0 overflow-hidden">
                            {l.imageUrls?.[0] ? (
                              <img src={l.imageUrls[0]} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-gray-300">
                                <Building2 className="w-5 h-5" />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-gray-900 truncate max-w-[200px]">{l.title}</div>
                            <div className="flex items-center gap-2 mt-0.5">
                              {l.urgent && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-500 text-white">СРОЧНО</span>}
                              <span className="text-[11px] text-gray-400">{l.type}</span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-500 hidden md:table-cell">
                        <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{getDistrictName(l.location, l.location)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-bold text-emerald-800">{l.price.toLocaleString('ru-RU')} с.</span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">
                        <div className="flex items-center gap-3">
                          <span className="flex items-center gap-1"><BedDouble className="w-3 h-3" />{l.rooms}</span>
                          <span className="flex items-center gap-1"><Square className="w-3 h-3" />{l.area}м²</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell text-gray-500">{l.date}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Link
                            to={`/listing/${l.id}`}
                            target="_blank"
                            className="p-2 rounded-lg hover:bg-emerald-50 text-gray-400 hover:text-emerald-600 transition-colors"
                            title="Открыть на сайте"
                          >
                            <Eye className="w-4 h-4" />
                          </Link>
                          <Link
                            to={`/admin/listings/edit/${l.id}`}
                            className="p-2 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors"
                            title="Редактировать"
                          >
                            <Pencil className="w-4 h-4" />
                          </Link>
                          <button
                            onClick={() => handleDelete(l.id)}
                            className="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
                            title="Удалить"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {filtered.length > 0 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
              <span className="text-xs text-gray-500">
                {(currentPage - 1) * perPage + 1}–{Math.min(currentPage * perPage, filtered.length)} из {filtered.length}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`w-8 h-8 rounded-lg text-xs font-semibold transition-colors ${p === currentPage ? 'text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                    style={p === currentPage ? { backgroundColor: '#1a4d3a' } : undefined}
                  >
                    {p}
                  </button>
                ))}
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Импорт: окно подтверждения с предпросмотром (что реально произойдёт) */}
        {importPreview && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setImportPreview(null)}>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-bold text-gray-900 mb-1">Импорт из Google Sheets</h3>
              <p className="text-sm text-gray-500 mb-4">Проверьте, что изменится, прежде чем подтвердить.</p>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3">
                  <div className="text-2xl font-bold text-emerald-700">{importPreview.toCreate}</div>
                  <div className="text-xs text-emerald-700/80">новых объектов создастся</div>
                </div>
                <div className="rounded-xl bg-amber-50 border border-amber-100 p-3">
                  <div className="text-2xl font-bold text-amber-700">{importPreview.toUpdate}</div>
                  <div className="text-xs text-amber-700/80">существующих обновится</div>
                </div>
              </div>

              {importPreview.updateTitles.length > 0 && (
                <div className="mb-3">
                  <div className="text-xs font-semibold text-gray-500 mb-1">Будут обновлены (примеры):</div>
                  <ul className="text-[13px] text-gray-700 list-disc pl-5 space-y-0.5">
                    {importPreview.updateTitles.map((t, i) => <li key={i}>{t}</li>)}
                  </ul>
                </div>
              )}
              {importPreview.createTitles.length > 0 && (
                <div className="mb-3">
                  <div className="text-xs font-semibold text-gray-500 mb-1">Будут созданы (примеры):</div>
                  <ul className="text-[13px] text-gray-700 list-disc pl-5 space-y-0.5">
                    {importPreview.createTitles.map((t, i) => <li key={i}>{t}</li>)}
                  </ul>
                </div>
              )}

              <p className="text-[12.5px] text-gray-500 bg-gray-50 rounded-lg p-2.5 mb-4">
                Импорт не удаляет объекты — строки, которых нет в таблице, останутся без изменений. Обновление
                перезапишет поля существующих объектов данными из таблицы.
              </p>

              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => setImportPreview(null)}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-100"
                >
                  Отмена
                </button>
                <button
                  onClick={() => importMutation.mutate()}
                  disabled={importMutation.isPending}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50"
                  style={{ backgroundColor: '#1a4d3a' }}
                >
                  {importMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  Импортировать {importPreview.total} строк
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Экспорт: предупреждение о полной перезаписи таблицы */}
        {showExportConfirm && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowExportConfirm(false)}>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-bold text-gray-900 mb-1">Экспорт в Google Sheets</h3>
              <p className="text-sm text-gray-700 mb-4">
                В таблицу будут выгружены <b>все {all.length} объектов</b>. Текущее содержимое листа будет
                <b> полностью перезаписано</b> — если вы вносили правки прямо в таблице и ещё не импортировали их,
                они пропадут.
              </p>
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => setShowExportConfirm(false)}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-100"
                >
                  Отмена
                </button>
                <button
                  onClick={() => { setShowExportConfirm(false); exportMutation.mutate(); }}
                  className="px-5 py-2.5 rounded-xl text-sm font-bold text-white"
                  style={{ backgroundColor: '#1a4d3a' }}
                >
                  Выгрузить в таблицу
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
