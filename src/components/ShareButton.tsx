import { useLocale } from '@/hooks/useLocale';
import { useEffect, useRef, useState } from 'react';
import { Check, Share2 } from 'lucide-react';
import { shareOrCopy, type ShareContent } from '@/lib/share';

interface ShareButtonProps extends ShareContent {
  /** Подпись для читалки экрана: у кнопки только значок. */
  label?: string;
  className?: string;
  /** CRM-воронка покупателя (see useTrackListingEvent) — вызывается сразу по
   * клику, не дожидаясь результата shareOrCopy: нажали «поделиться» — событие
   * засчитано, даже если сам шаринг потом отменили в системном меню. */
  onShare?: () => void;
}

/**
 * Круглая кнопка «поделиться» — рядом с «избранным» в шапке объявления.
 *
 * ЗАЧЕМ. Объявление показывают не себе: его пересылают жене, брату, начальнику.
 * До этого делиться со страницы объекта было нечем — адрес копировали из строки
 * браузера, а на телефоне это отдельное упражнение. Ссылку заменяли скриншотом,
 * по которому не открыть ни телефон агента, ни остальные фотографии.
 *
 * На телефоне открывается системное меню со всем, куда телефон умеет отправлять.
 * На компьютере системного меню нет — там ссылка просто уходит в буфер обмена,
 * и значок на две секунды меняется на галочку: без ответа человек жмёт второй раз.
 */
export default function ShareButton({ label = 'Поделиться объектом', className, onShare, ...content }: ShareButtonProps) {
  const { text: tx } = useLocale();
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  const handleClick = () => {
    onShare?.();
    // Без `await` до вызова: право открыть системное меню живёт ровно до первой
    // паузы после нажатия (см. lib/share.ts).
    void shareOrCopy(content).then((result) => {
      if (result === 'copied') {
        setCopied(true);
        if (timerRef.current !== null) window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => setCopied(false), 2000);
      } else if (result === 'failed') {
        // Буфер недоступен (старый браузер, отказ в разрешении) — показываем
        // адрес, чтобы человек скопировал руками, а не гадал, сработала ли кнопка.
        window.prompt(tx('Скопируйте ссылку:'), content.url);
      }
      // 'shared' — системное меню отчиталось само; 'cancelled' — передумал.
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        aria-label={tx(label)}
        className={
          className ??
          'w-9 h-9 rounded-full flex items-center justify-center bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors'
        }
      >
        {copied ? <Check className="w-5 h-5 text-emerald-700" /> : <Share2 className="w-5 h-5" />}
      </button>
      {/* Галочка — подтверждение для глаз; читалке экрана нужно то же словами. */}
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? tx("Ссылка скопирована") : ''}
      </span>
    </>
  );
}
