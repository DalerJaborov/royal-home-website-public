import { useState } from 'react';
import { trpc } from '@/providers/trpc';
import { Sparkles, Loader2, KeyRound, Image as ImageIcon } from 'lucide-react';

const inputClass =
  'w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-800/30 transition-all';

/** Тумблер с подписью-пояснением на русском. */
function Toggle({
  checked, onChange, disabled, title, hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  title: string;
  hint: string;
}) {
  return (
    <label className={`flex items-start gap-3 cursor-pointer ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 mt-0.5 ${checked ? 'bg-emerald-700' : 'bg-gray-300'}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : ''}`}
        />
      </button>
      <span>
        <span className="block text-sm font-semibold text-gray-900">{title}</span>
        <span className="block text-xs text-gray-500 mt-0.5">{hint}</span>
      </span>
    </label>
  );
}

/** Поле секретного API-ключа: наружу видна только маска, ввод по кнопке «Заменить/Указать». */
function ApiKeyField({
  label, hint, placeholder, mask, envKeyPresent, required, saving, onSave,
}: {
  label: string;
  hint: string;
  placeholder: string;
  mask: string | null | undefined;
  envKeyPresent: boolean | undefined;
  /** Ключ нужен выбранной сейчас модели — без него генерация не заработает. */
  required: boolean;
  saving: boolean;
  onSave: (key: string) => void;
}) {
  const [value, setValue] = useState('');
  const [open, setOpen] = useState(false);

  const save = () => {
    onSave(value.trim());
    setValue('');
    setOpen(false);
  };

  return (
    <div>
      <div className="flex items-center gap-3 flex-wrap">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
          <KeyRound className="w-4 h-4 text-gray-400" /> {label}
        </span>
        {mask ? (
          <span className="text-sm font-mono text-gray-600 bg-gray-50 px-2 py-0.5 rounded-lg">{mask}</span>
        ) : envKeyPresent ? (
          <span className="text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg">используется ключ с сервера</span>
        ) : required ? (
          <span className="text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded-lg">не задан — генерация не заработает</span>
        ) : (
          <span className="text-xs text-gray-500 bg-gray-50 px-2 py-0.5 rounded-lg">не задан</span>
        )}
        <button
          onClick={() => setOpen((v) => !v)}
          className="text-xs font-medium text-emerald-800 hover:underline"
        >
          {open ? 'Отмена' : mask ? 'Заменить ключ' : 'Указать ключ'}
        </button>
      </div>
      <p className="text-xs text-gray-500 mt-1">{hint}</p>
      {open && (
        <div className="flex gap-2 mt-2 max-w-lg">
          <input
            type="password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            className={inputClass}
            autoComplete="off"
          />
          <button
            onClick={save}
            disabled={!value.trim() || saving}
            className="px-4 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-50"
            style={{ backgroundColor: '#1a4d3a' }}
          >
            Сохранить
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Приоритетные темы/запросы (по одной на строку): локальный черновик +
 * кнопка «Сохранить». Родитель ремоунтит поле через key при смене серверного
 * значения, поэтому state здесь всегда стартует с актуального текста.
 */
function PriorityTopicsField({
  initial, saving, onSave,
}: {
  initial: string;
  saving: boolean;
  onSave: (text: string) => void;
}) {
  const [value, setValue] = useState(initial);
  const dirty = value !== initial;

  return (
    <div>
      <label className="block text-sm font-semibold text-gray-900 mb-1" htmlFor="blog-priority-topics">
        Приоритетные темы/запросы
      </label>
      <p className="text-xs text-gray-500 mb-2">
        Вставьте реальные запросы из Search Console/Яндекс.Метрики (по одному на строку) — ИИ будет
        выбирать темы из них в первую очередь. Пусто — модель выбирает тему сама, как раньше.
      </p>
      <textarea
        id="blog-priority-topics"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={5}
        placeholder={'купить квартиру в душанбе недорого\nцены на квартиры в сино\nкак оформить ипотеку в таджикистане'}
        className={`${inputClass} font-mono text-xs leading-relaxed resize-y`}
        spellCheck={false}
      />
      <div className="flex items-center gap-3 mt-2">
        <button
          onClick={() => onSave(value)}
          disabled={!dirty || saving}
          className="px-4 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-50"
          style={{ backgroundColor: '#1a4d3a' }}
        >
          {saving ? 'Сохраняю…' : 'Сохранить темы'}
        </button>
        {dirty && !saving && <span className="text-xs text-amber-600">Есть несохранённые изменения</span>}
      </div>
    </div>
  );
}

/**
 * Секция «ИИ-статьи» админ-страницы блога: генератор, тумблеры автогенерации
 * и автопубликации, выбор модели (Claude/Gemini), ключи API (с маской),
 * таблица статей с действиями.
 */
/**
 * Панель ИИ-генератора статей: кнопки запуска и настройки.
 *
 * Сами статьи здесь НЕ перечисляются: они выводятся в общем списке блога вместе
 * со статьями, написанными руками (AdminBlogPage). Отдельный список делал из
 * статьи генератора «чужую» — она висела отдельной карточкой сверху, хотя для
 * владельца это такая же статья блога.
 */
export default function AdminAiArticles() {
  const utils = trpc.useUtils();
  const { data: articles } = trpc.blog.adminList.useQuery();
  const { data: settings } = trpc.blog.settings.get.useQuery();

  const invalidate = () => {
    utils.blog.adminList.invalidate();
    utils.blog.list.invalidate();
  };

  const generateNow = trpc.blog.generateNow.useMutation({
    onSuccess: () => invalidate(),
    onError: (e) => alert(`Не удалось сгенерировать статью:\n${e.message}`),
  });
  const setSettings = trpc.blog.settings.set.useMutation({
    onSuccess: () => utils.blog.settings.get.invalidate(),
    onError: (e) => alert(`Не удалось сохранить настройку: ${e.message}`),
  });

  // Массовая перерисовка идёт по одной статье с ожиданием: одним запросом это не
  // проходит — Cloudflare рвёт соединение на 100 секундах, а картинка рисуется
  // 10–20 секунд. Своя мутация без всплывающего окна на каждую ошибку.
  const bulkCover = trpc.blog.generateCover.useMutation();
  const [bulk, setBulk] = useState<{ done: number; total: number } | null>(null);

  const drawAllCovers = async () => {
    if (!articles?.length || bulk) return;
    const minutes = Math.max(1, Math.round((articles.length * 25) / 60));
    if (
      !confirm(
        `Нарисовать новые обложки всем статьям генератора (${articles.length})?\n\n` +
          `Сцену для каждой картинки модель придумает сама, прочитав статью.\n` +
          `Займёт примерно ${minutes} мин. Текущие обложки будут заменены — вкладку не закрывайте.`
      )
    ) {
      return;
    }

    setBulk({ done: 0, total: articles.length });
    const errors: string[] = [];
    for (const [i, a] of articles.entries()) {
      try {
        await bulkCover.mutateAsync({ id: a.id });
      } catch (e) {
        errors.push(`«${a.title}»: ${e instanceof Error ? e.message : 'неизвестная ошибка'}`);
      }
      setBulk({ done: i + 1, total: articles.length });
    }
    setBulk(null);
    invalidate();
    alert(
      errors.length
        ? `Готово: ${articles.length - errors.length} из ${articles.length}.\n\nНе получилось:\n${errors.join('\n')}`
        : `Готово: обложки нарисованы всем статьям (${articles.length}).`
    );
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-6">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
        <div>
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-emerald-700" /> Генератор статей для SEO
          </h2>
          <p className="text-xs text-gray-500 mt-1 max-w-xl">
            Пишет статьи на основе реальных данных сайта: цены и количество квартир по районам,
            самые просматриваемые объекты. Это привлекает людей из поиска Google/Яндекс на сайт.
            Готовые статьи — в общем списке ниже.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={drawAllCovers}
            disabled={!articles?.length || bulk !== null}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-emerald-900 bg-emerald-50 border border-emerald-200 transition-all hover:bg-emerald-100 disabled:opacity-60"
            title="Перерисовать обложки всем статьям генератора: сцену модель придумает по тексту каждой статьи"
          >
            {bulk ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
            {bulk ? `Рисую ${bulk.done}/${bulk.total}…` : 'Обложки всем'}
          </button>
          <button
            onClick={() => generateNow.mutate()}
            disabled={generateNow.isPending}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 disabled:opacity-60"
            style={{ backgroundColor: '#1a4d3a' }}
            title="Написать одну статью прямо сейчас (займёт до двух минут)"
          >
            {generateNow.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {generateNow.isPending ? 'Пишу статью…' : 'Написать статью сейчас'}
          </button>
        </div>
      </div>

      {/* Настройки */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-3">
        <Toggle
          checked={settings?.autogenEnabled ?? false}
          disabled={!settings || setSettings.isPending}
          onChange={(v) => setSettings.mutate({ autogenEnabled: v })}
          title="Автогенерация раз в неделю"
          hint="Сервер сам пишет новую статью каждые 7 дней. Выключили тумблер — генерация полностью остановлена (это и есть кнопка «стоп»)."
        />
        <Toggle
          checked={settings?.autoPublish ?? false}
          disabled={!settings || setSettings.isPending}
          onChange={(v) => setSettings.mutate({ autoPublish: v })}
          title="Публиковать сразу"
          hint="Включено (по умолчанию) — новая статья сразу видна на сайте. Выключено — статья попадает в черновики и ждёт, пока вы её откроете и опубликуете."
        />
      </div>

      {/* Обложка статьи */}
      <div className="border-t border-gray-100 pt-4 mt-4">
        <span className="block text-sm font-semibold text-gray-900 mb-2">Откуда берётся картинка к статье</span>
        <div className="flex flex-col sm:flex-row gap-2" role="radiogroup" aria-label="Источник обложки статьи">
          {([
            { value: 'mixed', name: 'По теме статьи', note: 'реальные фото или редакционные иллюстрации' },
            { value: 'generated', name: 'Рисует ИИ', note: 'картинка под тему статьи' },
            { value: 'photo', name: 'Фото из каталога', note: 'снимок популярного объекта' },
          ] as const).map((opt) => {
            const active = (settings?.coverMode ?? 'mixed') === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={!settings || setSettings.isPending}
                onClick={() => setSettings.mutate({ coverMode: opt.value })}
                className={`px-4 py-2.5 rounded-xl border text-sm text-left transition-all disabled:opacity-50 ${
                  active
                    ? 'border-emerald-700 bg-emerald-50 text-emerald-900'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                }`}
              >
                <span className="font-bold">{opt.name}</span>
                <span className="ml-1.5 text-xs opacity-70">({opt.note})</span>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-gray-500 mt-1.5">
          Рисует Gemini — нужен ключ Gemini с подключённой оплатой (на бесплатном картинки недоступны).
          Не получилось нарисовать — статья всё равно выйдет, с фотографией из каталога.
        </p>
        {settings && !settings.geminiProxyConfigured && (
          <p className="text-xs text-amber-700 mt-1.5">
            На сервере не заданы GEMINI_PROXY_URL и GEMINI_PROXY_KEY — из нашего региона Google
            отвечает отказом, и ни статьи, ни картинки работать не будут.
          </p>
        )}
      </div>

      {/* Приоритетные темы из реальных поисковых запросов */}
      <div className="border-t border-gray-100 pt-4 mt-4">
        <PriorityTopicsField
          key={settings?.priorityTopics ?? ''}
          initial={settings?.priorityTopics ?? ''}
          saving={setSettings.isPending}
          onSave={(text) => setSettings.mutate({ priorityTopics: text })}
        />
      </div>

      {/* Ключ API */}
      <div className="border-t border-gray-100 pt-4 mt-4">
        <ApiKeyField
          label="Ключ Gemini API"
          hint="На нём работают и статьи, и картинки к ним. Получить: aistudio.google.com → Get API key; для картинок нужна подключённая оплата. Ключ хранится на сервере, целиком наружу не показывается — только последние 4 символа."
          placeholder="AIza…"
          mask={settings?.geminiApiKeyMask}
          envKeyPresent={settings?.geminiEnvKeyPresent}
          required
          saving={setSettings.isPending}
          onSave={(key) => setSettings.mutate({ geminiApiKey: key })}
        />
      </div>
    </div>
  );
}
