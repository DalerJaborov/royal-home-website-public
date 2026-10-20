/**
 * Отправка ссылки: системное меню телефона, а где его нет — мессенджеры и буфер.
 *
 * ЗАЧЕМ ОТДЕЛЬНЫМ ФАЙЛОМ. Делиться нужно двумя разными вещами — статьёй в блоге
 * и объявлением, — и оба места считали адрес и копировали его сами. Вторая копия
 * этой логики появилась бы ровно в тот день, когда кнопку попросят ещё где-то.
 *
 * ПОЧЕМУ СИСТЕМНОЕ МЕНЮ ВАЖНЕЕ ДВУХ КНОПОК. Кнопки «WhatsApp» и «Telegram» —
 * это выбор за человека: у него может быть Instagram, почта, заметки или просто
 * другой контакт в том же WhatsApp. Системное меню отдаёт весь список, куда
 * телефон умеет отправлять, и открывается одним нажатием. На компьютере такого
 * меню нет — там две явные кнопки как раз уместны, поэтому остаются обе ветки.
 *
 * ⚠️ shareOrCopy ВЫЗЫВАТЬ ИЗ ОБРАБОТЧИКА НАЖАТИЯ И БЕЗ `await` ПЕРЕД ЭТИМ:
 * браузер отдаёт системное меню, только пока не истёк «след» нажатия человека.
 */

export interface ShareContent {
  title: string;
  /** Что уйдёт вместе со ссылкой: цена, район. Мессенджеры показывают именно это. */
  text?: string;
  url: string;
}

export type ShareResult =
  /** Открылось системное меню и человек выбрал приложение. */
  | 'shared'
  /** Системного меню нет — ссылка легла в буфер обмена. */
  | 'copied'
  /** Человек закрыл меню. Не ошибка: ругаться на это нельзя. */
  | 'cancelled'
  | 'failed';

/**
 * Адрес текущей страницы. Берём из window, а не собираем из данных объявления:
 * страницу могли открыть по короткой ссылке или с меткой рекламной кампании —
 * делиться надо ровно тем, что человек видит в адресной строке.
 */
export function currentUrl(): string {
  return typeof window === 'undefined' ? '' : window.location.href;
}

/** Есть ли системное меню «Поделиться». На компьютере обычно нет — это норма. */
export function canNativeShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

export async function shareOrCopy(content: ShareContent): Promise<ShareResult> {
  const data: ShareData = { title: content.title, text: content.text, url: content.url };

  // canShare объявлен не везде, где есть share (старые Android): его отсутствие
  // не повод не пытаться — проверяем, только когда он действительно есть.
  const shareable =
    typeof navigator.share === 'function' && (typeof navigator.canShare !== 'function' || navigator.canShare(data));

  if (shareable) {
    try {
      await navigator.share(data);
      return 'shared';
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
      // Прочие отказы не тупик: ссылку всё ещё можно положить в буфер.
    }
  }

  return (await copyText(content.url)) ? 'copied' : 'failed';
}

export function whatsappShareUrl(title: string, url: string): string {
  return `https://wa.me/?text=${encodeURIComponent(`${title} — ${url}`)}`;
}

export function telegramShareUrl(title: string, url: string): string {
  return `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`;
}

/**
 * Буфер обмена. Современный API работает только по https (или на localhost);
 * за ним стоит старый execCommand — он объявлен устаревшим, но остаётся
 * единственным способом скопировать текст там, где первого нет.
 */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Отказано — пробуем старый способ ниже.
  }

  const area = document.createElement('textarea');
  area.value = text;
  // Не display:none и не hidden: невидимый элемент нельзя выделить, а без
  // выделения копировать нечего.
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.top = '-1000px';
  area.style.opacity = '0';
  document.body.appendChild(area);
  try {
    area.select();
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    area.remove();
  }
}
