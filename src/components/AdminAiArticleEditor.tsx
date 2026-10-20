import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { trpc } from '@/providers/trpc';
import FileUpload from './FileUpload';

const inputClass =
  'w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-800/30 transition-all';
const labelClass = 'text-xs text-gray-500 mb-1.5 block';

interface Form {
  title: string;
  excerpt: string;
  contentHtml: string;
  metaTitle: string;
  metaDescription: string;
  coverImageUrl: string;
}

const EMPTY: Form = { title: '', excerpt: '', contentHtml: '', metaTitle: '', metaDescription: '', coverImageUrl: '' };

/**
 * Редактор статьи блога, лежащей в таблице articles (статьи генератора и статьи,
 * написанные здесь руками). Отдельным файлом, потому что список статей теперь
 * общий (AdminBlogPage), а панель генератора — своя: редактор нужен списку.
 *
 * id === null — новая статья.
 */
export default function AdminAiArticleEditor({ id, onClose }: { id: number | null; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [form, setForm] = useState<Form>(EMPTY);
  const [loading, setLoading] = useState(id !== null);

  // Начальное состояние задано в useState, а не здесь: синхронный setState внутри
  // эффекта — каскадный ререндер и ошибка правила хуков (сборка падает).
  // Компонент монтируется заново на каждую статью (key в AdminBlogPage).
  useEffect(() => {
    if (id === null) return;
    let cancelled = false;
    // Полный текст в списке не гоняем — дотягиваем одну статью по требованию.
    utils.blog.adminGetById
      .fetch({ id })
      .then((full) => {
        if (cancelled) return;
        setForm({
          title: full.title,
          excerpt: full.excerpt ?? '',
          contentHtml: full.contentHtml,
          metaTitle: full.metaTitle ?? '',
          metaDescription: full.metaDescription ?? '',
          coverImageUrl: full.coverImageUrl ?? '',
        });
        setLoading(false);
      })
      .catch((e: unknown) => {
        alert(`Не удалось открыть статью: ${e instanceof Error ? e.message : ''}`);
        onClose();
      });
    return () => {
      cancelled = true;
    };
  }, [id, utils, onClose]);

  const done = () => {
    utils.blog.adminList.invalidate();
    utils.blog.list.invalidate();
    onClose();
  };
  const update = trpc.blog.update.useMutation({
    onSuccess: done,
    onError: (e) => alert(`Не удалось сохранить статью: ${e.message}`),
  });
  const create = trpc.blog.create.useMutation({
    onSuccess: done,
    onError: (e) => alert(`Не удалось создать статью: ${e.message}`),
  });
  const saving = update.isPending || create.isPending;

  const save = () => {
    const fields = {
      title: form.title,
      excerpt: form.excerpt,
      contentHtml: form.contentHtml,
      metaTitle: form.metaTitle,
      metaDescription: form.metaDescription,
      coverImageUrl: form.coverImageUrl || null,
    };
    if (id === null) create.mutate(fields);
    else update.mutate({ id, ...fields });
  };

  return (
    <div className="bg-white rounded-2xl border border-emerald-100 p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-gray-900">{id === null ? 'Новая статья' : 'Редактировать статью'}</h3>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
          <X className="w-4 h-4" />
        </button>
      </div>

      {loading ? (
        <div className="py-8 text-center text-gray-400 text-sm">Загружаю статью…</div>
      ) : (
        <>
          <div className="space-y-3">
            <div>
              <label className={labelClass}>Заголовок</label>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Краткое описание (показывается в карточке и в поиске)</label>
              <textarea
                value={form.excerpt}
                onChange={(e) => setForm({ ...form, excerpt: e.target.value })}
                rows={2}
                className={`${inputClass} resize-none`}
              />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>SEO-заголовок (title для Google, до 60 символов)</label>
                <input value={form.metaTitle} onChange={(e) => setForm({ ...form, metaTitle: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>SEO-описание (description для Google, до 160 символов)</label>
                <input
                  value={form.metaDescription}
                  onChange={(e) => setForm({ ...form, metaDescription: e.target.value })}
                  className={inputClass}
                />
              </div>
            </div>
            <div className="max-w-md">
              <FileUpload
                value={form.coverImageUrl}
                onChange={(url) => setForm((prev) => ({ ...prev, coverImageUrl: url }))}
                label="Обложка статьи (без неё — фирменный градиент)"
              />
            </div>
            <div>
              <label className={labelClass}>Текст статьи (HTML: &lt;h2&gt;, &lt;h3&gt;, &lt;p&gt;, &lt;ul&gt;, врезки и цитаты)</label>
              <textarea
                value={form.contentHtml}
                onChange={(e) => setForm({ ...form, contentHtml: e.target.value })}
                rows={16}
                className={`${inputClass} resize-y font-mono text-xs`}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={onClose} className="px-5 py-2.5 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100">
              Отмена
            </button>
            <button
              onClick={save}
              disabled={saving || !form.title.trim() || !form.contentHtml.trim()}
              className="px-6 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 disabled:opacity-60"
              style={{ backgroundColor: '#1a4d3a' }}
            >
              {saving ? 'Сохраняю…' : id === null ? 'Создать статью' : 'Сохранить статью'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
