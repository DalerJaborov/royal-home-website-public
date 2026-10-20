import { useLocale } from '@/hooks/useLocale';
import { getLeadSubmissionSource } from '@/lib/acquisitionAttribution';
import { useCallback, useEffect, useRef, useState } from 'react';
import { MessageCircle, X, Send, Phone, ArrowLeft, Check, MapPin, Maximize2, DoorOpen, ChevronLeft, ChevronRight, Images } from 'lucide-react';
import { TRPCClientError } from '@trpc/client';
import { trpc } from '@/providers/trpc';
import { useCreateLead } from '@/hooks/useCreateLead';
import { useAntiSpam } from '@/hooks/useAntiSpam';
import HoneypotField from '@/components/HoneypotField';

/**
 * Виджет в углу страницы: чат с ботом Royal Home и кнопка «Перезвоните мне».
 *
 * Отвечает не сайт, а бот CRM — тот же, что ведёт WhatsApp, Instagram и Telegram
 * (см. api/chat-router.ts → CRM /webhooks/website-chat). Поэтому разговор с сайта
 * попадает в общий инбокс, а живой агент может подхватить его оттуда прямо посреди
 * беседы: его реплики приходят обычным опросом и подписываются именем сотрудника.
 *
 * ДВЕ ВКЛАДКИ, А НЕ ОДНА. Часть людей не хочет переписываться вовсе — им нужно,
 * чтобы позвонили. Прятать это за «напишите боту» значит терять их: вкладка
 * «Перезвонить» — та же форма заявки, что на странице контактов (lead.create), с той
 * же защитой от спама, и уходит тем же путём в CRM.
 *
 * ЧТО ХРАНИМ В БРАУЗЕРЕ: только случайный идентификатор сессии. Ни имени, ни
 * телефона, ни истории — история живёт в CRM и подтягивается по этому идентификатору,
 * поэтому человек, вернувшийся на сайт, продолжает разговор, а не начинает заново.
 *
 * ПАНЕЛЬ НЕ РАЗМОНТИРУЕТСЯ ПРИ ЗАКРЫТИИ (найдено 23.08.2026 живым багом).
 * Раньше `{open && <ChatPanel/>}` уничтожало компонент вместе со всей историей
 * при каждом закрытии — вернувшись в чат, посетитель на секунду видел пустое
 * окно и быстрые вопросы, пока история заново не приезжала опросом, и это
 * выглядело как «переписка обнулилась». Теперь панель монтируется один раз, при
 * первом открытии, и дальше живёт до конца визита — видимость переключает CSS
 * (opacity/transform), а не React. Это же даёт нормальную анимацию ЗАКРЫТИЯ:
 * раньше при закрытии элемент исчезал из DOM мгновенно, никакой «мягкий уход»
 * был попросту невозможен технически.
 */

const POLL_MS = 4000;

/** То же самое, что CRM показала бы фотографиями в мессенджере — здесь заменяет
 *  их карточкой: у посетителя сайта ещё нет ни телефона, ни вложений мессенджера. */
interface PropertyCard {
  shortId: number;
  title: string;
  price: string;
  rooms?: number;
  areaSqm?: number;
  district: string;
  address?: string;
  photoUrl: string | null;
  /** Вся галерея объекта (23.08.2026: «сделай так, чтобы можно было все смотреть
   *  в карточке») — не только обложка. У старых карточек (до правки) может не
   *  быть вовсе — тогда используется одиночный photoUrl. */
  photoUrls?: string[];
  siteUrl: string;
}

interface Bubble {
  role: 'user' | 'assistant';
  content: string;
  at: string | null;
  author: 'bot' | 'human' | null;
  propertyCard?: PropertyCard;
}

const GREETING: Bubble = {
  role: 'assistant',
  content: 'Здравствуйте! Я консультант Royal Home. Подскажу по квартирам, ценам и районам — что вас интересует?',
  at: null,
  author: 'bot',
};

const QUICK_REPLIES = ['Хочу купить квартиру', 'Хочу продать', 'Сколько стоит оценка?'];

/**
 * ДВА ПУЗЫРЯ БОТА, А НЕ ОДИН С ПЕРЕНОСОМ СТРОКИ (найдено 23.08.2026: «печатает
 * выдаёт, что это бот, нужна полная имитация человека»).
 *
 * Бот в один ход иногда отвечает двумя короткими репликами подряд — тот же приём,
 * что и в WhatsApp/Instagram («Здравствуйте!» отдельно, вопрос по существу
 * отдельно), там это и правда два отдельных сообщения мессенджера. В истории CRM
 * они хранятся ОДНОЙ записью с `\n` между ними (тот же формат, что и у остальных
 * каналов — `[reply, reply2].join("\n")` в conversation.ts на стороне CRM; трогать
 * эту общую запись ради одного канала рискованно — она разделяемая между всеми
 * мессенджерами). На сайте это раньше рисовалось одним пузырём с переносом строки
 * внутри — сразу видно, что текст сочинён и выдан машиной целиком, а не напечатан
 * человеком по кусочкам. Разбиваем строго реплики АССИСТЕНТА на `\n` — свои
 * переносы строк посетителя (вставил многострочный текст) не трогаем, это его
 * собственное форматирование.
 */
function splitAssistantBubbles(incoming: Bubble[]): Bubble[] {
  return incoming.flatMap((b) =>
    b.role === 'assistant' && b.content.includes('\n')
      ? b.content
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => ({ ...b, content: line }))
      : [b]
  );
}

/**
 * КАРТОЧКА ОБЪЕКТА В ЧАТЕ (владелец 23.08.2026: «красивая карточка с фото и ценой
 * и прочее важной информацией чтобы не выходя из чата клиент мог узнать, а потом
 * кнопка если хочет просмотреть тот объект»).
 *
 * Занимает место обычного текстового пузыря бота — как в мессенджерах фото
 * заменяет собой реплику, здесь карточка заменяет её же. Переход на полную
 * страницу объекта — в новой вкладке (`target="_blank"`): уйти со страницы,
 * не потеряв открытый чат и историю переписки, важнее одного лишнего таба.
 */
/**
 * Полноэкранный просмотр всей галереи объекта (владелец 23.08.2026: «сделай так,
 * чтобы можно было все смотреть в карточке») — открывается по тапу на фото, не
 * уводя посетителя со страницы и не требуя перехода на полную карточку сайта.
 */
function PropertyLightbox({
  photos,
  index,
  onIndex,
  onClose,
}: {
  photos: string[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const { text: tx } = useLocale();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') onIndex((index - 1 + photos.length) % photos.length);
      if (e.key === 'ArrowRight') onIndex((index + 1) % photos.length);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, photos.length, onIndex, onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label={tx("Закрыть просмотр фото")}
        className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
      >
        <X className="h-5 w-5" />
      </button>
      <img
        src={photos[index]}
        alt=""
        className="max-h-full max-w-full rounded-lg object-contain"
        onClick={(e) => e.stopPropagation()}
      />
      {photos.length > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onIndex((index - 1 + photos.length) % photos.length);
            }}
            aria-label={tx("Предыдущее фото")}
            className="absolute left-2 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 sm:left-4"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onIndex((index + 1) % photos.length);
            }}
            aria-label={tx("Следующее фото")}
            className="absolute right-2 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 sm:right-4"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-[12.5px] text-white">
            {index + 1} / {photos.length}
          </div>
        </>
      )}
    </div>
  );
}

function PropertyCardView({ card }: { card: PropertyCard }) {
  const { text: tx } = useLocale();
  const photos = card.photoUrls && card.photoUrls.length > 0 ? card.photoUrls : card.photoUrl ? [card.photoUrl] : [];
  const [index, setIndex] = useState(0);
  const [lightbox, setLightbox] = useState(false);

  return (
    <div className="w-full max-w-[280px] overflow-hidden rounded-2xl rounded-bl-md border border-gray-100 bg-white shadow-sm">
      <div className="relative aspect-[4/3] w-full bg-gray-100">
        {photos.length > 0 ? (
          <button
            type="button"
            onClick={() => setLightbox(true)}
            className="block h-full w-full cursor-zoom-in"
            aria-label={tx("Смотреть все фото")}
          >
            <img src={photos[index]} alt={tx(card.title)} className="h-full w-full object-cover" loading="lazy" />
          </button>
        ) : (
          <div className="grid h-full w-full place-items-center text-gray-300">
            <MessageCircle className="h-8 w-8" />
          </div>
        )}
        {photos.length > 1 && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIndex((i) => (i - 1 + photos.length) % photos.length);
              }}
              aria-label={tx("Предыдущее фото")}
              className="absolute left-1.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full bg-black/35 text-white hover:bg-black/50"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIndex((i) => (i + 1) % photos.length);
              }}
              aria-label={tx("Следующее фото")}
              className="absolute right-1.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full bg-black/35 text-white hover:bg-black/50"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <div className="absolute bottom-1.5 right-1.5 flex items-center gap-1 rounded-full bg-black/50 px-2 py-0.5 text-[11px] text-white">
              <Images className="h-3 w-3" />
              {index + 1}/{photos.length}
            </div>
          </>
        )}
      </div>
      {lightbox && photos.length > 0 && (
        <PropertyLightbox photos={photos} index={index} onIndex={setIndex} onClose={() => setLightbox(false)} />
      )}
      <div className="space-y-1.5 p-3.5">
        <div className="text-[15px] font-bold text-emerald-700">{tx(card.price)}</div>
        <div className="text-[13.5px] font-medium leading-snug text-gray-800">{tx(card.title)}</div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-gray-500">
          {typeof card.rooms === 'number' && (
            <span className="flex items-center gap-1">
              <DoorOpen className="h-3.5 w-3.5" />
              {card.rooms}{tx("-комн.")} </span>
          )}
          {typeof card.areaSqm === 'number' && (
            <span className="flex items-center gap-1">
              <Maximize2 className="h-3.5 w-3.5" />
              {card.areaSqm}  {tx("м²")} </span>
          )}
          <span className="flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" />
            {tx(card.address || card.district)}
          </span>
        </div>
        <a
          href={card.siteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1.5 block rounded-xl bg-emerald-600 px-3 py-2 text-center text-[13.5px] font-semibold text-white transition-colors hover:bg-emerald-700"
        >
           {tx("Смотреть объект")} </a>
      </div>
    </div>
  );
}

export default function ChatPanel({
  sessionId,
  tab,
  onTab,
  open,
  onClose,
}: {
  sessionId: string;
  tab: 'chat' | 'callback';
  onTab: (t: 'chat' | 'callback') => void;
  open: boolean;
  onClose: () => void;
}) {
  const { text: tx } = useLocale();
  // Esc закрывает окно — как любое модальное окно на сайте; человек не должен
  // искать мышью крестик. Слушатель нужен только пока панель реально открыта.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Полноэкранный чат на телефоне блокирует прокрутку страницы под собой — иначе
  // фон «резинится» под панелью при попытке долистать переписку с самого верха.
  // Завязано на `open`, а не на монтирование: панель теперь живёт весь визит, и
  // без этой правки прокрутка страницы осталась бы заблокированной НАВСЕГДА
  // после первого же открытия чата, даже когда он визуально закрыт.
  useEffect(() => {
    const isMobile = window.matchMedia('(max-width: 639px)').matches;
    if (!open || !isMobile) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  /**
   * Пульс на иконке звонка в шапке — привлечь внимание к «Перезвоните мне» при
   * КАЖДОМ открытии чата, не бесконечно (владелец 23.08.2026). key меняется при
   * каждом открытии — React пересоздаёт узел, и CSS-анимация с конечным числом
   * повторов (см. tailwind.config.js: ring-attention, 2 раза) стартует заново,
   * вместо того чтобы остаться доигранной с прошлого раза.
   *
   * Обновление состояния прямо во время рендера (а не в useEffect) — приём из
   * официальной документации React для «среагировать на смену пропа»: значение
   * готово уже к ЭТОМУ проходу рендера, лишнего лишнего цикла эффект→setState→
   * повторный рендер не возникает.
   */
  const [pulseKey, setPulseKey] = useState(0);
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setPulseKey((k) => k + 1);
  }

  return (
    <div
      role="dialog"
      aria-label={tx("Чат с консультантом Royal Home")}
      aria-hidden={!open}
      className={
        'fixed inset-0 z-[75] flex flex-col overflow-hidden bg-white transition-[opacity,transform] duration-300 ease-out ' +
        /**
         * `sm:h-[...]`, НЕ `sm:max-h-[...]` (найдено 23.08.2026 на десктопе: окно
         * выглядело крошечным). `max-h` задаёт только потолок, а фактическую высоту
         * при `h-auto` определяет контент — панель схлопывалась до размера шапки
         * плюс пары строк, а `flex-1` у ленты сообщений внутри не от чего было
         * растягивать: родитель сам не имел зафиксированной высоты. Прямая `h-[...]`
         * даёт панели реальный размер, и `flex-1` наконец получает от чего отталкиваться.
         */
        'sm:inset-auto sm:bottom-24 sm:right-6 sm:h-[min(680px,82dvh)] sm:w-[400px] sm:rounded-[20px] sm:border sm:border-gray-100 sm:shadow-[0_20px_60px_-12px_rgba(0,0,0,0.28)] ' +
        (open
          ? 'pointer-events-auto translate-y-0 scale-100 opacity-100'
          : 'pointer-events-none translate-y-3 scale-[0.97] opacity-0')
      }
    >
      <header className="flex shrink-0 items-center gap-2 bg-emerald-600 px-3.5 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-white sm:pt-3">
        {tab === 'callback' && (
          <button
            type="button"
            onClick={() => onTab('chat')}
            aria-label={tx("Назад к чату")}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-white/90 hover:bg-white/15"
          >
            <ArrowLeft className="h-4.5 w-4.5" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14.5px] font-semibold leading-tight">
            {tab === 'chat' ? 'ROYAL HOME' : tx("Перезвоните мне")}
          </p>
          <p className="flex items-center gap-1.5 text-[12px] text-white/75">
            {tab === 'chat' && <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />}
            {tab === 'chat' ? tx("Обычно отвечаем сразу") : tx("Оставьте номер — позвоним")}
          </p>
        </div>
        {/**
         * ИКОНКА ЗВОНКА ВМЕСТО ТЕКСТОВОЙ ССЫЛКИ (владелец 23.08.2026, «как в
         * JivoSite»). Раньше «Не хочу писать — перезвоните мне» была строкой под
         * полем ввода — незаметной и по ощущениям вторичной. Круглая иконка в
         * шапке рядом с крестиком — тот же вес, что у самого чата, и с коротким
         * двойным пульсом ловит взгляд в первые секунды после открытия, не
         * раздражая постоянным миганием.
         */}
        {tab === 'chat' && (
          <button
            key={pulseKey}
            type="button"
            onClick={() => onTab('callback')}
            aria-label={tx("Перезвоните мне")}
            title={tx("Перезвоните мне")}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/15 text-white hover:bg-white/25 animate-ring-attention"
          >
            <Phone className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label={tx("Закрыть чат")}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-white/90 hover:bg-white/15"
        >
          <X className="h-5 w-5" />
        </button>
      </header>

      {tab === 'chat' ? <ChatTab sessionId={sessionId} open={open} /> : <CallbackTab />}
    </div>
  );
}

function ChatTab({ sessionId, open }: { sessionId: string; open: boolean }) {
  const { text: tx } = useLocale();
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  // Пока история ещё не пришла хотя бы раз — не показывать ни приветствие, ни
  // быстрые вопросы: именно их мелькание при пустом bubbles и читалось как
  // «чат перезагрузился» у вернувшегося посетителя (найдено 23.08.2026).
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [text, setText] = useState('');
  const [typing, setTyping] = useState(false);
  const [error, setError] = useState('');
  const [withHuman, setWithHuman] = useState(false);
  const send = trpc.chat.send.useMutation();
  const utils = trpc.useUtils();
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Отметка последней показанной реплики: по ней сервер отдаёт только новое.
  const lastAt = useRef<string | undefined>(undefined);
  // Если опрос так и не принёс ответ (сбой ИИ, зависшая очередь) — не держать
  // «печатает…» вечно: через полминуты честно предложить оставить номер.
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Гонка двойной отправки: см. submit() ниже.
  const sendingRef = useRef(false);

  const append = useCallback((incoming: Bubble[]) => {
    if (incoming.length === 0) return;
    const split = splitAssistantBubbles(incoming);
    // Карточки разных объектов делят один и тот же текст-заглушку
    // ("[🏠 карточка объекта]") — без shortId в ключе вторая карточка в том же
    // диалоге молча считалась бы дублем первой и не рисовалась вовсе.
    const baseKey = (b: Bubble) => `${b.role}|${b.content}|${b.propertyCard?.shortId ?? ''}`;
    // Время — тоже часть ключа: раньше дедуп шёл по одному тексту против ВСЕЙ
    // истории, и повторное одинаковое «Да» посетителя (другой момент времени)
    // молча схлопывалось с первым и не рисовалось вовсе. Локальные эхо (at=null)
    // сравниваются как раньше — у них времени ещё нет.
    const key = (b: Bubble) => `${baseKey(b)}|${b.at ?? 'local'}`;
    setBubbles((prev) => {
      const next = [...prev];
      const seen = new Set(next.map(key));
      let changed = false;
      for (const b of split) {
        if (seen.has(key(b))) continue;
        if (b.at) {
          // Реплика посетителя уже нарисована локально (эхо без at) — не рисуем
          // её второй раз, когда та же строка вернётся из истории CRM: вместо
          // нового пузыря присваиваем эху серверное время. Это же освобождает
          // текст для СЛЕДУЮЩЕГО такого же сообщения — оно получит своё эхо.
          const echoIdx = next.findIndex((p) => p.at === null && baseKey(p) === baseKey(b));
          if (echoIdx !== -1) {
            next[echoIdx] = { ...next[echoIdx], at: b.at };
            seen.add(key(next[echoIdx]));
            changed = true;
            continue;
          }
        }
        next.push(b);
        seen.add(key(b));
        changed = true;
      }
      return changed ? next : prev;
    });
    const newest = incoming.filter((b) => b.at).pop();
    if (newest?.at) lastAt.current = newest.at;
  }, []);

  /**
   * ИСТОРИЯ И НОВЫЕ РЕПЛИКИ — ОДИН ОПРОС НА ВЕСЬ ВИЗИТ, НЕ НА КАЖДОЕ ОТКРЫТИЕ.
   *
   * Эффект живёт ровно так же долго, как сам ChatTab, — а с 23.08.2026 ChatTab
   * монтируется один раз при первом открытии и больше не размонтируется (см.
   * ChatWidget). Поэтому таймер опроса не пересоздаётся при закрытии/открытии
   * панели — он просто пропускает сетевую работу, пока панель не видна
   * (`!open`), тем же приёмом, что и для вкладки браузера в фоне. Первый тик
   * после самого первого открытия тянет ВЕСЬ диалог (человек мог писать вчера);
   * дальше — только то, что появилось после последней показанной реплики.
   */
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      if (!open || document.hidden) return;
      try {
        const res = await utils.client.chat.poll.query({ sessionId, after: lastAt.current });
        if (!alive) return;
        append(res.messages as Bubble[]);
        setWithHuman(res.paused);
        setHistoryLoaded(true);
        // Ответ бота приходит ТОЛЬКО так, опросом (см. submit ниже — почему):
        // как только пришла хоть одна реплика ассистента, ждать больше нечего.
        if (res.messages.some((m) => m.role === 'assistant')) {
          setTyping(false);
          if (typingTimeout.current) {
            clearTimeout(typingTimeout.current);
            typingTimeout.current = null;
          }
          /**
           * ГАСИМ «Ответ задерживается» (найдено 23.08.2026 живым диалогом).
           * Раньше банер ошибки ставил только 45-секундный таймер submit() — если
           * ответ приходил чуть позже (тяжёлый ход: подбор объекта + показ занял
           * больше обычного), таймер успевал выстрелить за миг ДО настоящего
           * ответа, и баннер оставался висеть НАВСЕГДА поверх уже пришедшего
           * ответа — ничто, кроме следующей отправки, его не убирало. Раз ответ
           * реально пришёл, ошибка неактуальна, каким бы ни было её происхождение.
           */
          setError('');
        }
      } catch {
        // Сеть моргнула — следующий опрос через несколько секунд. Показывать
        // посетителю ошибку опроса незачем: он ничего с ней не сделает. Но
        // разблокировать экран приветствия всё равно нужно — иначе одна
        // неудачная попытка держала бы «загрузку» вечно.
        setHistoryLoaded(true);
      }
    };
    void tick();
    const timer = setInterval(tick, POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [sessionId, utils, append, open]);

  // Лента всегда прокручена к последнему сообщению — включая момент, когда
  // появляется «печатает…».
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [bubbles, typing]);

  useEffect(() => {
    // На телефоне автофокус сразу поднимает клавиатуру и закрывает половину
    // только что открывшегося полноэкранного чата — на десктопе это, наоборот,
    // удобно: окно маленькое, курсор в поле и так ожидаем. Завязано на `open`
    // (а не на монтирование): панель теперь живёт весь визит, и без этого поле
    // получило бы фокус только при самом первом открытии.
    if (open && window.matchMedia('(min-width: 640px)').matches) {
      // Небольшая задержка — панель ещё доигрывает анимацию появления;
      // фокус посреди translate/scale-перехода дёргает скролл страницы.
      const t = setTimeout(() => inputRef.current?.focus(), 200);
      return () => clearTimeout(t);
    }
  }, [open]);

  /**
   * ОТВЕТ ПРИХОДИТ ТОЛЬКО ОПРОСОМ, НЕ ИЗ ЭТОГО ЗАПРОСА (23.08.2026, живой баг).
   *
   * Бот отвечает не сразу: несколько коротких сообщений подряд («Хочу купить»,
   * «квартиру») специально ждут друг друга секунды-полторы, чтобы склеиться в один
   * ответ вместо ответа на каждый обрывок, — тот же приём, что и в WhatsApp. Раньше
   * `chat.send` держал это соединение открытым и ждал ответ внутри себя: если сеть
   * посетителя (мобильная, слабый Wi-Fi) рвала долгое соединение раньше срока, чат
   * выглядел зависшим, а сервер молча продолжал обрабатывать ход — нетерпеливое
   * повторное сообщение запускало ВТОРОЙ независимый ход, и оба ответа (оба
   * «Здравствуйте») в итоге всплывали разом. `chat.send` теперь только кладёт
   * сообщение в очередь и отвечает мгновенно; сам ответ бота получает `poll()`
   * выше — так же, как получает и реплику подхватившего диалог агента.
   */
  const submit = async (value: string) => {
    const trimmed = value.trim();
    // `send.isPending` — состояние React-хука, оно обновляется рендером и не
    // успевает измениться между двумя Enter, нажатыми почти одновременно (или
    // Enter + клик по кнопке за те же миллисекунды). Синхронный ref закрывает
    // гонку, которую React здесь предотвратить не может.
    if (!trimmed || sendingRef.current) return;
    sendingRef.current = true;
    setError('');
    setText('');
    // Своя реплика рисуется сразу, не дожидаясь сервера: пауза между «отправил» и
    // «увидел» читается как «не отправилось». Обратно из истории она не задвоится —
    // append отсекает уже показанные пары «роль + текст».
    append([{ role: 'user', content: trimmed, at: null, author: null }]);
    setTyping(true);
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => {
      setTyping(false);
      setError('Ответ задерживается. Попробуйте ещё раз или оставьте номер — перезвоним.');
    }, 45_000);
    try {
      // origin + pathname, обрезанный до 500: полный href с рекламным хвостом
      // (utm, gclid…) превышал предел Zod-схемы (max 500) и ронял отправку
      // сырой ошибкой валидации — хотя для CRM важна лишь сама страница.
      const pageUrl = (window.location.origin + window.location.pathname).slice(0, 500);
      const res = await send.mutateAsync({ sessionId, text: trimmed, pageUrl });
      // Бот выключен в CRM (botOff) — ответа опросом не будет вовсе: не держим
      // «печатает…» и 45-секундный таймер, которые закончились бы ложной
      // ошибкой, а честно говорим, что сообщение дошло и ответит человек.
      if (res.botOff) {
        if (typingTimeout.current) {
          clearTimeout(typingTimeout.current);
          typingTimeout.current = null;
        }
        setTyping(false);
        append([
          {
            role: 'assistant',
            content: 'Сообщение получено — сотрудник ответит здесь же.',
            at: null,
            author: null,
          },
        ]);
      }
    } catch (err) {
      if (typingTimeout.current) clearTimeout(typingTimeout.current);
      setTyping(false);
      setError(
        err instanceof TRPCClientError
          ? err.message
          : 'Не удалось отправить. Попробуйте ещё раз или оставьте номер — перезвоним.'
      );
    } finally {
      // Освобождаем сразу после ответа сервера («принято в очередь», доли секунды),
      // а не после ответа бота — иначе следующее сообщение нельзя было бы
      // отправить, пока идёт дебаунс, а живой человек как раз так и пишет.
      sendingRef.current = false;
    }
  };

  const shown = bubbles.length > 0 ? bubbles : historyLoaded ? [GREETING] : [];

  return (
    <>
      <div ref={listRef} className="flex-1 space-y-2.5 overflow-y-auto overscroll-contain bg-gray-50/70 px-4 py-4">
        {!historyLoaded && (
          <div className="flex justify-start" aria-hidden="true">
            <div className="flex items-center gap-1 rounded-2xl rounded-bl-md border border-gray-100 bg-white px-3.5 py-3 shadow-sm">
              {[0, 150, 300].map((delay) => (
                <span
                  key={delay}
                  className="h-1.5 w-1.5 animate-pulse rounded-full bg-gray-300"
                  style={{ animationDelay: `${delay}ms` }}
                />
              ))}
            </div>
          </div>
        )}

        {shown.map((b, i) =>
          b.propertyCard ? (
            <div key={i} className="flex justify-start">
              <PropertyCardView card={b.propertyCard} />
            </div>
          ) : (
            <div key={i} className={b.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
              <div
                className={
                  b.role === 'user'
                    ? 'max-w-[85%] rounded-2xl rounded-br-md bg-emerald-600 px-3.5 py-2.5 text-[14.5px] leading-snug text-white whitespace-pre-wrap break-words'
                    : 'max-w-[85%] rounded-2xl rounded-bl-md border border-gray-100 bg-white px-3.5 py-2.5 text-[14.5px] leading-snug text-gray-800 shadow-sm whitespace-pre-wrap break-words'
                }
              >
                {b.author === 'human' && (
                  <span className="mb-1 block text-[12px] font-semibold text-emerald-700">{tx("Агент Royal Home")}</span>
                )}
                {b.role === 'assistant' && b.author !== 'human' ? tx(b.content) : b.content}
              </div>
            </div>
          )
        )}

        {typing && (
          <div className="flex justify-start">
            <div className="flex items-center gap-1 rounded-2xl rounded-bl-md border border-gray-100 bg-white px-3.5 py-3 shadow-sm">
              {[0, 150, 300].map((delay) => (
                <span
                  key={delay}
                  className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400"
                  style={{ animationDelay: `${delay}ms` }}
                />
              ))}
            </div>
          </div>
        )}

        {historyLoaded && bubbles.length === 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {QUICK_REPLIES.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => void submit(tx(q))}
                className="rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-[13.5px] font-medium text-emerald-700 hover:bg-emerald-50"
              >
                {tx(q)}
              </button>
            ))}
          </div>
        )}

        {withHuman && (
          <p className="pt-1 text-center text-[12.5px] text-gray-500">{tx("С вами говорит сотрудник Royal Home")}</p>
        )}
        {error && <p className="pt-1 text-center text-[13px] text-red-600">{tx(error)}</p>}
      </div>

      <div className="border-t border-gray-100 bg-white px-3 py-2.5">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              // Enter отправляет, Shift+Enter — перенос строки: привычка из любого
              // мессенджера, и человек не должен искать кнопку мышью.
              // isComposing: клавиша Enter, которой подтверждают выбор в IME
              // (китайская/японская раскладка и т.п.), тоже приходит как
              // key==='Enter' — без проверки сообщение улетало бы на полпути
              // набора иероглифа.
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void submit(text);
              }
            }}
            placeholder={tx("Напишите сообщение…")}
            aria-label={tx("Сообщение")}
            className="max-h-28 min-h-[44px] flex-1 resize-none rounded-2xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-[14.5px] outline-none transition-colors focus:border-emerald-500 focus:bg-white"
          />
          <button
            type="button"
            onClick={() => void submit(text)}
            disabled={!text.trim() || send.isPending}
            aria-label={tx("Отправить")}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-emerald-600 text-white transition hover:bg-emerald-700 disabled:opacity-40"
          >
            <Send className="h-4.5 w-4.5" />
          </button>
        </div>
      </div>
    </>
  );
}

/** Секунд обратного отсчёта «соединяем с оператором» — только в рабочее время
 *  (см. CallbackTab). Ориентир — известный паттерн виджетов обратного звонка
 *  (CallPage и подобные: 27-30 секунд «до звонка»), адаптированный под честную
 *  формулировку: мы не звоним автоматически, но именно столько держим ощущение
 *  «заявка уже летит», пока агент реально не увидел её и не открыл карточку. */
const CONNECT_SECONDS = 30;

/**
 * Та же заявка, что и в форме на странице контактов: один путь в CRM, одна защита
 * от спама. Второй способ отправки лида разошёлся бы с первым молча.
 *
 * ТРИ СОСТОЯНИЯ, А НЕ ДВА (владелец 23.08.2026). Раньше после отправки сразу
 * показывалось сухое «заявка принята» — по ощущениям неотличимо от обычной формы
 * обратной связи, которую никто не торопится читать. Теперь в рабочее время
 * между отправкой и финальным экраном стоит анимация «соединяем с оператором»:
 * секундомер, пульсирующая трубка, прогресс по кругу — тот же приём, которым
 * известные виджеты обратного звонка (CallPage и похожие) убеждают посетителя,
 * что за кнопкой стоит настоящий человек, а не форма в пустоту.
 *
 * ЧЕСТНОСТЬ ГРАНИЦЫ. Мы не обещаем, что телефон прямо зазвонит через 30 секунд —
 * автодозвона для звонков с сайта пока нет (см. D:\CRM,
 * royalhome-callback-as-normal-lead-23-08): заявка уходит агенту как лид. Поэтому
 * текст финального экрана после отсчёта — простое «спасибо, ждите звонка», без
 * упоминания того, что происходит у нас внутри (владелец 23.08.2026: «зачем
 * говорить, что агент видит номер»).
 *
 * ВНЕ РАБОЧЕГО ВРЕМЕНИ анимации нет вовсе: обещать «соединяем» ночью, когда
 * набирать физически некому, было бы обманом, который посетитель раскроет за
 * полминуты молчания. Вне часов — обычная заявка с честным «перезвоним утром».
 */
function CallbackTab() {
  const { text: tx } = useLocale();
  /**
   * ТОЛЬКО ТАДЖИКСКИЕ НОМЕРА (владелец 23.08.2026): звонить на иностранный номер
   * с рабочей линии нельзя технически, поэтому +992 — не подсказка, а рамка,
   * которую нельзя стереть. Храним только 9 локальных цифр (совпадает с длиной
   * настоящего номера — «90 000 00 00»), префикс приклеивается при отправке.
   */
  const [localPhone, setLocalPhone] = useState('');
  const phoneValid = localPhone.length === 9;
  const [name, setName] = useState('');
  const [phase, setPhase] = useState<'form' | 'connecting' | 'done'>('form');
  const [withinHours, setWithinHours] = useState(false);
  const [error, setError] = useState('');
  const createLead = useCreateLead();
  const utils = trpc.useUtils();
  const { hp, setHp, getAntiSpamFields } = useAntiSpam('callback_widget');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      /**
       * РАБОЧИЕ ЧАСЫ СПРАШИВАЕМ ПРЯМО ЗДЕСЬ, А НЕ ЧЕРЕЗ ФОНОВЫЙ useQuery.
       *
       * Была настоящая гонка (найдено 23.08.2026 при живой проверке): фоновый
       * запрос стартует, когда открылась вкладка, а посетитель, знающий свой
       * номер наизусть, успевает набрать его и нажать «Жду звонка» быстрее, чем
       * приходит ответ. `hours.data` в этот момент ещё `undefined` — и анимация
       * молча не показывалась даже в рабочее время. Запрос в момент отправки
       * (параллельно с самой заявкой, а не после неё — незачем ждать дважды)
       * закрывает гонку: к моменту решения ответ уже есть.
       */
      const [, wh] = await Promise.all([
        createLead.mutateAsync({
          name: name.trim() || undefined,
          phone: `+992${localPhone}`,
          message: 'Просит перезвонить (кнопка «Перезвоните мне» на сайте)',
          ...getLeadSubmissionSource('Кнопка «Перезвоните мне»'),
          ...(await getAntiSpamFields()),
        }),
        utils.client.chat.workingHours.query(),
      ]);
      // Заявка ушла ДО анимации, не после неё: секундомер — это ожидание
      // ощущения, а не ожидание сети. Если отсчёт прервут закрытием чата, лид уже
      // в CRM в любом случае.
      setWithinHours(wh.within);
      setPhase(wh.within ? 'connecting' : 'done');
    } catch (err) {
      setError(
        err instanceof TRPCClientError
          ? err.message
          : 'Не удалось отправить. Попробуйте ещё раз или позвоните нам.'
      );
    }
  };

  if (phase === 'connecting') {
    return <ConnectingAnimation onDone={() => setPhase('done')} />;
  }

  if (phase === 'done') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-10 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-emerald-50 text-emerald-600">
          <Check className="h-7 w-7" />
        </span>
        <p className="text-[16px] font-semibold text-gray-900">{tx("Заявка у оператора")}</p>
        <p className="text-[14px] leading-snug text-gray-500">
          {withinHours
            ? tx("Спасибо! Ожидайте звонка в ближайшее время.")
            : tx("Спасибо! Мы перезвоним вам в начале рабочего дня.")}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
      <p className="text-[14px] leading-snug text-gray-600">
         {tx("Оставьте номер — агент перезвонит и ответит на вопросы голосом. Это быстрее переписки.")} </p>
      <div>
        <label htmlFor="cb-phone" className="mb-1 block text-[13.5px] font-semibold text-gray-700">
           {tx("Телефон")} </label>
        <div className="flex items-stretch overflow-hidden rounded-xl border border-gray-200 bg-gray-50 transition-colors focus-within:border-emerald-500 focus-within:bg-white">
          <span className="flex select-none items-center border-r border-gray-200 bg-gray-100/80 px-3 text-[15px] font-medium text-gray-500">
            +992
          </span>
          <input
            id="cb-phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            required
            autoFocus={window.matchMedia('(min-width: 640px)').matches}
            value={localPhone}
            onChange={(e) => setLocalPhone(e.target.value.replace(/\D/g, '').slice(0, 9))}
            placeholder="90 000 00 00"
            aria-describedby="cb-phone-hint"
            className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-[15px] outline-none"
          />
        </div>
        <p id="cb-phone-hint" className="mt-1 text-[12px] text-gray-400">
           {tx("Звоним только на номера Таджикистана — 9 цифр после +992.")} </p>
      </div>
      <div>
        <label htmlFor="cb-name" className="mb-1 block text-[13.5px] font-semibold text-gray-700">
           {tx("Как к вам обращаться")} <span className="font-normal text-gray-400">{tx("— по желанию")}</span>
        </label>
        <input
          id="cb-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={tx("Имя")}
          className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-[15px] outline-none transition-colors focus:border-emerald-500 focus:bg-white"
        />
      </div>
      <HoneypotField value={hp} onChange={setHp} />
      {error && <p className="text-[13.5px] text-red-600">{tx(error)}</p>}
      <button
        type="submit"
        disabled={createLead.isPending || !phoneValid}
        className="w-full rounded-xl bg-emerald-600 py-3 text-[15px] font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
      >
        {createLead.isPending ? tx("Отправляем…") : tx("Жду звонка")}
      </button>
      <p className="text-center text-[12.5px] leading-snug text-gray-400">
         {tx("Нажимая кнопку, вы соглашаетесь на обработку персональных данных.")} </p>
    </form>
  );
}

/**
 * Анимация «соединяем с оператором»: кольцо прогресса против часовой стрелки,
 * пульсирующая трубка внутри, число секунд. Чистый CSS/SVG — ничего внешнего,
 * ничего платного, ровно тот эффект, который в живых виджетах обратного звонка
 * убеждает посетителя, что заявка не улетела в пустоту.
 */
function ConnectingAnimation({ onDone }: { onDone: () => void }) {
  const { text: tx } = useLocale();
  const [left, setLeft] = useState(CONNECT_SECONDS);

  useEffect(() => {
    if (left <= 0) {
      const t = setTimeout(onDone, 400);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setLeft((v) => v - 1), 1000);
    return () => clearTimeout(t);
  }, [left, onDone]);

  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const progress = left / CONNECT_SECONDS;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-10 text-center">
      <div className="relative h-32 w-32">
        <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
          <circle cx="60" cy="60" r={radius} fill="none" stroke="#d1fae5" strokeWidth="6" />
          <circle
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke="#059669"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - progress)}
            style={{ transition: 'stroke-dashoffset 1s linear' }}
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <span className="grid h-16 w-16 place-items-center rounded-full bg-emerald-600 text-white shadow-[0_0_0_0_rgba(5,150,105,0.5)] animate-callring">
            <Phone className="h-7 w-7" />
          </span>
        </div>
      </div>
      <div>
        <p className="text-[17px] font-semibold text-gray-900">{tx("Соединяем с оператором…")}</p>
        <p className="mt-1 text-[14px] text-gray-500">{tx("Ваш номер уже передан — осталось")} {left}  {tx("сек.")}</p>
      </div>
    </div>
  );
}
