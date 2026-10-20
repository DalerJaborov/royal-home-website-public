import { useMemo, useState } from 'react';
import { useCms } from '@/contexts/CmsContext';
import { trpc } from '@/providers/trpc';
import AdminLayout from '@/components/AdminLayout';
import AdminAiArticles from '@/components/AdminAiArticles';
import AdminAiArticleEditor from '@/components/AdminAiArticleEditor';
import FileUpload from '@/components/FileUpload';
import { Save, Plus, Pencil, Trash2, Eye, EyeOff, Calendar, Tag, X, ExternalLink, Image as ImageIcon, Loader2 } from 'lucide-react';

const emptyPost = { id: 0, title: '', excerpt: '', category: 'Покупка', date: new Date().toLocaleDateString('ru-RU'), image: '', content: '', active: true };
const CATEGORIES = ['Покупка', 'Продажа', 'Ипотека', 'Инвестиции', 'Юридические вопросы', 'Ремонт', 'Районы'];

export default function AdminBlogPage() {
  const { cms, updateBlogPosts } = useCms();
  const utils = trpc.useUtils();
  const { data: aiArticles } = trpc.blog.adminList.useQuery();
  const aiCount = aiArticles?.length ?? 0;
  const publishedAiCount = aiArticles?.filter(a => a.status === 'published').length ?? 0;
  const [posts, setPosts] = useState(cms.blogPosts);

  // ─── Статьи генератора: живут в таблице articles, но в списке идут вперемешку
  //     со статьями из cms — для владельца это одни и те же статьи блога. ───
  const [editingAi, setEditingAi] = useState<number | null | 'new'>(null);
  const [coverPendingId, setCoverPendingId] = useState<number | null>(null);
  const invalidateAi = () => {
    utils.blog.adminList.invalidate();
    utils.blog.list.invalidate();
  };
  const publishAi = trpc.blog.publish.useMutation({ onSuccess: invalidateAi });
  const unpublishAi = trpc.blog.unpublish.useMutation({ onSuccess: invalidateAi });
  const deleteAi = trpc.blog.delete.useMutation({ onSuccess: invalidateAi });
  const generateCover = trpc.blog.generateCover.useMutation({
    onSuccess: () => { setCoverPendingId(null); invalidateAi(); },
    onError: (e) => { setCoverPendingId(null); alert(`Не удалось нарисовать обложку:\n${e.message}`); },
  });

  /** Общий список, отсортированный по дате: свежее сверху. */
  const rows = useMemo(() => {
    const parseRu = (d: string) => {
      const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(d.trim());
      return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])).getTime() : 0;
    };
    const ai = (aiArticles ?? []).map(a => {
      const when = new Date(a.publishedAt ?? a.createdAt);
      return { kind: 'ai' as const, ai: a, time: when.getTime(), dateLabel: when.toLocaleDateString('ru-RU') };
    });
    const cmsRows = posts.map(p => ({ kind: 'cms' as const, post: p, time: parseRu(p.date), dateLabel: p.date }));
    return [...ai, ...cmsRows].sort((a, b) => b.time - a.time);
  }, [aiArticles, posts]);
  const [saved, setSaved] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [form, setForm] = useState(emptyPost);

  const handleSave = () => { updateBlogPosts(posts); setSaved(true); setTimeout(() => setSaved(false), 2000); };
  const toggleActive = (id: number) => setPosts(prev => prev.map(p => p.id === id ? { ...p, active: !p.active } : p));

  const startEdit = (post: (typeof posts)[number]) => { setEditing(post.id); setForm({ ...post }); };
  const startNew = () => { setEditing(0); setForm({ ...emptyPost, id: Date.now() }); };
  const cancelEdit = () => { setEditing(null); setForm(emptyPost); };

  const savePost = () => {
    if (!form.title.trim()) { alert('Введите заголовок'); return; }
    if (editing === 0) {
      setPosts(prev => [...prev, form]);
    } else {
      setPosts(prev => prev.map(p => p.id === editing ? form : p));
    }
    setEditing(null);
    setForm(emptyPost);
  };

  const deletePost = (id: number) => { if (confirm('Удалить статью?')) setPosts(prev => prev.filter(p => p.id !== id)); };

  const inputClass = 'w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-800/30 transition-all';
  const labelClass = 'text-xs text-gray-500 mb-1.5 block';

  return (
    <AdminLayout>
      <div className="p-4 lg:p-8 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Блог</h1>
            {/* Считаем оба хранилища: статьи генератора — такие же статьи блога,
                и владелец сверяет это число с тем, что видит на сайте. */}
            <p className="text-sm text-gray-500 mt-1">
              {posts.filter(p => p.active).length + publishedAiCount} активных из {posts.length + aiCount}
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={startNew} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90" style={{ backgroundColor: '#1a4d3a' }}>
              <Plus className="w-4 h-4" /> Добавить
            </button>
            <button onClick={handleSave} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold border border-gray-200 hover:bg-gray-50 transition-all">
              <Save className="w-4 h-4" /> {saved ? 'Сохранено!' : 'Сохранить'}
            </button>
          </div>
        </div>

        {/* Панель генератора: кнопки и настройки. Сами статьи — в общем списке ниже. */}
        <AdminAiArticles />

        {editingAi !== null && (
          <AdminAiArticleEditor key={String(editingAi)} id={editingAi === 'new' ? null : editingAi} onClose={() => setEditingAi(null)} />
        )}

        {/* Edit form */}
        {editing !== null && (
          <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-900">{editing === 0 ? 'Новая статья' : 'Редактировать'}</h3>
              <button onClick={cancelEdit} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="space-y-3">
                <div><label className={labelClass}>Заголовок *</label><input type="text" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} className={inputClass} /></div>
                <div><label className={labelClass}>Краткое описание</label><textarea value={form.excerpt} onChange={e => setForm(p => ({ ...p, excerpt: e.target.value }))} rows={2} className={`${inputClass} resize-none`} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className={labelClass}>Категория</label><select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} className={inputClass}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></div>
                  <div><label className={labelClass}>Дата</label><input type="text" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} className={inputClass} /></div>
                </div>
              </div>
              <div>
                <FileUpload value={form.image} onChange={url => setForm(p => ({ ...p, image: url }))} label="Обложка статьи" />
              </div>
            </div>
            <div className="mt-3"><label className={labelClass}>Полный текст</label><textarea value={form.content} onChange={e => setForm(p => ({ ...p, content: e.target.value }))} rows={4} className={`${inputClass} resize-none`} placeholder="HTML или текст..." /></div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={cancelEdit} className="px-5 py-2.5 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100">Отмена</button>
              <button onClick={savePost} className="px-6 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90" style={{ backgroundColor: '#1a4d3a' }}>Сохранить статью</button>
            </div>
          </div>
        )}

        {/* Единый список: статьи генератора и написанные руками — вперемешку по дате.
            Раньше статьи генератора висели отдельной карточкой сверху и выглядели
            чужими, хотя для владельца это такие же статьи блога. */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="divide-y divide-gray-50">
            {rows.map(row => row.kind === 'ai' ? (
              <div key={`ai-${row.ai.id}`} className={`flex items-center gap-4 p-4 hover:bg-gray-50/50 transition-colors ${row.ai.status === 'published' ? '' : 'opacity-50'}`}>
                <div className="w-14 h-14 rounded-xl bg-gray-100 flex-shrink-0 overflow-hidden">
                  {row.ai.coverImageUrl
                    ? <img src={row.ai.coverImageUrl} alt="" loading="lazy" className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs">Нет фото</div>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-900 truncate">{row.ai.title}</div>
                  <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                    <span className="flex items-center gap-1"><Tag className="w-3 h-3" />{row.ai.category || 'Аналитика'}</span>
                    <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{row.dateLabel}</span>
                    {row.ai.status !== 'published' && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700">Черновик</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {row.ai.status === 'published' && (
                    <a href={`/blog/${row.ai.slug}`} target="_blank" rel="noreferrer" className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors" title="Открыть на сайте">
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                  <button
                    onClick={() => (row.ai.status === 'published' ? unpublishAi.mutate({ id: row.ai.id }) : publishAi.mutate({ id: row.ai.id }))}
                    className={`p-2 rounded-lg transition-colors ${row.ai.status === 'published' ? 'text-emerald-600 hover:bg-emerald-50' : 'text-gray-400 hover:bg-gray-100'}`}
                    title={row.ai.status === 'published' ? 'Снять с публикации' : 'Опубликовать на сайте'}
                  >
                    {row.ai.status === 'published' ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => { setCoverPendingId(row.ai.id); generateCover.mutate({ id: row.ai.id }); }}
                    disabled={coverPendingId !== null}
                    className="p-2 rounded-lg hover:bg-emerald-50 text-gray-400 hover:text-emerald-700 transition-colors disabled:opacity-50"
                    title="Нарисовать новую обложку по теме статьи (до минуты)"
                  >
                    {coverPendingId === row.ai.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
                  </button>
                  <button onClick={() => setEditingAi(row.ai.id)} className="p-2 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors" title="Редактировать текст и SEO-поля">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => { if (confirm(`Удалить статью «${row.ai.title}»? Это действие необратимо.`)) deleteAi.mutate({ id: row.ai.id }); }}
                    className="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                    title="Удалить статью"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              <div key={`cms-${row.post.id}`} className={`flex items-center gap-4 p-4 hover:bg-gray-50/50 transition-colors ${!row.post.active ? 'opacity-50' : ''}`}>
                <div className="w-14 h-14 rounded-xl bg-gray-100 flex-shrink-0 overflow-hidden">
                  {row.post.image ? <img src={row.post.image} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs">Нет фото</div>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-900 truncate">{row.post.title}</div>
                  <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                    <span className="flex items-center gap-1"><Tag className="w-3 h-3" />{row.post.category}</span>
                    <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{row.post.date}</span>
                    {!row.post.active && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-gray-200 text-gray-500">Скрыта</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => toggleActive(row.post.id)} className={`p-2 rounded-lg transition-colors ${row.post.active ? 'text-emerald-600 hover:bg-emerald-50' : 'text-gray-400 hover:bg-gray-100'}`} title={row.post.active ? 'Скрыть с сайта' : 'Показать на сайте'}>
                    {row.post.active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </button>
                  <button onClick={() => startEdit(row.post)} className="p-2 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors"><Pencil className="w-4 h-4" /></button>
                  <button onClick={() => deletePost(row.post.id)} className="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            ))}
          </div>
          {rows.length === 0 && <div className="p-12 text-center text-gray-500">Нет статей</div>}
        </div>
      </div>
    </AdminLayout>
  );
}
