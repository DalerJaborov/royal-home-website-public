import { useLocale } from '@/hooks/useLocale';
import { useEffect, useState } from 'react';
import { Link2, Check, Send, MessageCircle, Share2 } from 'lucide-react';
import { canNativeShare, currentUrl, shareOrCopy, telegramShareUrl, whatsappShareUrl } from '@/lib/share';

/**
 * Кнопки «поделиться» под статьёй.
 *
 * WhatsApp и Telegram — не украшение: в Душанбе ссылками обмениваются именно
 * там, и статью, которую переслали знакомому, читает второй человек без единого
 * сомони на рекламу. Плюс упоминания в мессенджерах и соцсетях — то, что
 * ИИ-поисковики учитывают наравне со ссылками.
 *
 * НА ТЕЛЕФОНЕ ВМЕСТО ТРЁХ КНОПОК ОДНА. Там есть системное меню «Поделиться», и
 * оно заведомо шире нашего списка: Instagram, почта, заметки, конкретный контакт.
 * Держать рядом с ним свои две кнопки значит предлагать человеку выбирать из
 * куска того, что телефон и так покажет целиком. На компьютере системного меню
 * нет — там прежний ряд остаётся единственным способом переслать статью.
 *
 * Наличие системного меню выясняем один раз ленивым начальным значением, а не
 * эффектом: сайт целиком отрисовывается в браузере (createRoot, без гидратации
 * серверной разметки), поэтому navigator доступен уже на первом рендере, и
 * расходиться с сервером тут нечему.
 */
export default function ArticleShare({ title }: { title: string }) {
  const { text: tx } = useLocale();
  const [copied, setCopied] = useState(false);
  const [nativeShare] = useState(canNativeShare);
  const url = currentUrl();

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const share = () => {
    // Без `await` до вызова: право открыть системное меню живёт ровно до первой
    // паузы после нажатия (см. lib/share.ts).
    void shareOrCopy({ title, url }).then((result) => {
      if (result === 'copied') setCopied(true);
      else if (result === 'failed') window.prompt(tx('Скопируйте ссылку:'), url);
    });
  };

  const btn =
    'inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors';

  return (
    <div className="mt-10 pt-6 border-t border-gray-100">
      <p className="text-sm text-gray-500 mb-3">{tx("Статья полезна? Отправьте тому, кто выбирает квартиру:")}</p>
      <div className="flex flex-wrap gap-2">
        {nativeShare ? (
          <button className={btn} onClick={share} type="button">
            <Share2 className="w-4 h-4 text-emerald-700" />  {tx("Поделиться")} </button>
        ) : (
          <>
            <a className={btn} href={whatsappShareUrl(title, url)} target="_blank" rel="noreferrer noopener">
              <MessageCircle className="w-4 h-4 text-emerald-700" /> WhatsApp
            </a>
            <a className={btn} href={telegramShareUrl(title, url)} target="_blank" rel="noreferrer noopener">
              <Send className="w-4 h-4 text-emerald-700" /> Telegram
            </a>
            <button className={btn} onClick={share} type="button">
              {copied ? <Check className="w-4 h-4 text-emerald-700" /> : <Link2 className="w-4 h-4 text-emerald-700" />}
              {copied ? tx("Ссылка скопирована") : tx("Копировать ссылку")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
