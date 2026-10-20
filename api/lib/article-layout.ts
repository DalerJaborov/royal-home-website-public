/**
 * Сборка «живой» статьи: блок «Коротко», плитки с цифрами, вынесенная мысль и
 * картинки внутри текста.
 *
 * ЗАЧЕМ. Статья из сплошного текста под одной обложкой читается по диагонали и
 * закрывается. Эти блоки решают две задачи сразу: человек за десять секунд видит
 * ответ и цифры, а ИИ-поисковики (AI Overviews, Gemini) получают самодостаточный
 * кусок в начале статьи — именно оттуда они чаще всего и цитируют.
 *
 * ПОЧЕМУ ВЁРСТКА ЗДЕСЬ, А НЕ В БАЗЕ ОТДЕЛЬНЫМИ ПОЛЯМИ. Блоки собираются в тот же
 * contentHtml с фирменными классами (`article-*`), которые стилизует страница
 * статьи. Так не нужна миграция таблицы, статья остаётся одним куском HTML —
 * её можно править руками в админке, и она целиком уезжает в поиск.
 *
 * Классы должны совпадать со списком в sanitize-html.ts (allowedClasses) и со
 * стилями в src/index.css — иначе санитайзер их вырежет и блок останется без вида.
 */

export interface KeyFact {
  value: string;
  label: string;
}

/** Экранирование текста, который кладём в HTML: он приходит от модели. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Блок «Коротко» — выводы статьи. Пусто на входе — пусто на выходе. */
export function buildTakeawaysHtml(takeaways: string[] | undefined): string {
  const items = (takeaways ?? []).map((t) => t.trim()).filter(Boolean).slice(0, 5);
  if (items.length < 2) return "";
  return (
    `<div class="article-takeaways"><p class="article-takeaways-title">Коротко</p><ul>` +
    items.map((t) => `<li>${escapeHtml(t)}</li>`).join("") +
    `</ul></div>`
  );
}

/** Плитки с ключевыми цифрами. */
export function buildKeyFactsHtml(facts: KeyFact[] | undefined): string {
  const items = (facts ?? []).filter((f) => f?.value?.trim() && f?.label?.trim()).slice(0, 4);
  if (items.length < 2) return "";
  return (
    `<div class="article-key-facts">` +
    items
      .map(
        (f) =>
          `<div class="article-fact"><span class="article-fact-value">${escapeHtml(f.value.trim())}</span>` +
          `<span class="article-fact-label">${escapeHtml(f.label.trim())}</span></div>`
      )
      .join("") +
    `</div>`
  );
}

/** Вынесенная мысль. */
export function buildPullQuoteHtml(quote: string | undefined): string {
  const text = quote?.trim();
  if (!text || text.length < 20) return "";
  return `<blockquote class="article-quote">${escapeHtml(text)}</blockquote>`;
}

/** Картинка внутри статьи с подписью. */
export function buildFigureHtml(url: string, caption: string): string {
  return (
    `<figure class="article-figure"><img src="${escapeHtml(url)}" alt="${escapeHtml(caption)}" loading="lazy" />` +
    `<figcaption>${escapeHtml(caption)}</figcaption></figure>`
  );
}

/**
 * Вставляет блок ПОСЛЕ раздела, начинающегося с заданного <h2>: то есть прямо
 * перед следующим <h2>, а если следующего нет — в конец.
 *
 * Заголовок модель называет своими словами, поэтому сравниваем по «сжатому» виду
 * (без тегов, регистра, пунктуации и лишних пробелов) — иначе картинка молча
 * уезжала бы в конец статьи каждый раз, когда модель поставит другое тире.
 */
export function insertAfterSection(html: string, heading: string, block: string): string {
  if (!block) return html;
  const headings = [...html.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)];
  if (!headings.length) return html + block;

  const normalize = (s: string) =>
    s
      .replace(/<[^>]+>/g, " ")
      .toLowerCase()
      .replace(/[^a-zа-яё0-9]+/gi, " ")
      .trim();

  const target = normalize(heading);
  const idx = headings.findIndex((m) => {
    const h = normalize(m[1]);
    return h === target || (target.length > 10 && (h.includes(target) || target.includes(h)));
  });
  if (idx < 0) return html + block;

  const next = headings[idx + 1];
  if (!next) return html + block;
  const cut = next.index ?? html.length;
  return html.slice(0, cut) + block + html.slice(cut);
}

/**
 * Оставляет только ссылки на существующие адреса сайта, остальные разворачивает
 * в обычный текст (сама подпись ссылки сохраняется).
 *
 * ЗАЧЕМ. Первая же статья с внутренними ссылками получила выдуманные адреса вида
 * `/search/sino/3-komnatnye` — их на сайте нет, все три давали 404. Просьба в
 * промте «ссылайся только на переданные адреса» — это просьба, а не гарантия
 * (см. правило репозитория), поэтому список проверяется здесь.
 *
 * Внешние ссылки (http/https) не трогаем: это ссылки на источники новостей,
 * они как раз повышают доверие и к статье, и к сайту.
 */
export function keepOnlyAllowedLinks(html: string, allowedPaths: string[], allowedExternal?: string[]): { html: string; removed: string[] } {
  const removed: string[] = [];
  const allowed = new Set(allowedPaths);

  const cleaned = html.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (whole, attrs: string, text: string) => {
    const href = /href\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1]?.trim() ?? "";
    if (/^https?:\/\//i.test(href) || href.startsWith("mailto:") || href.startsWith("tel:")) {
      if (allowedExternal === undefined || allowedExternal.includes(href)) return whole;
      try {
        const url = new URL(href);
        if (url.origin === "https://royalhome.tj" && allowed.has(url.pathname.replace(/\/+$/, "") || "/")) return whole;
      } catch { /* reject */ }
      removed.push(href); return text;
    }
    // Якорь внутри самой статьи (оглавление) никуда не ведёт наружу.
    if (href.startsWith("#")) return whole;
    // Якоря и параметры отбрасываем при сверке: /listings?rooms=3 — это /listings.
    const path = href.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
    if (allowed.has(path)) return whole;
    removed.push(href || "(без адреса)");
    return text;
  });

  return { html: cleaned, removed };
}

// ─── Оглавление ───

/** Якорь из заголовка: латиница/цифры остаются, остальное — в дефисы. */
function headingAnchor(text: string, index: number): string {
  const base = text
    .replace(/<[^>]+>/g, "")
    .toLowerCase()
    .replace(/[^a-zа-яё0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  // Кириллица в id допустима (HTML5), но в адресной строке она превращается в
  // %D1%8D… — номер раздела в конце гарантирует уникальность даже у одинаковых.
  return `razdel-${index + 1}${base ? `-${base}` : ""}`;
}

/**
 * Проставляет якоря заголовкам и собирает оглавление.
 *
 * Зачем серверная сборка, а не React: статику отдаёт префтуренный HTML, и
 * оглавление должно быть видно поисковику вместе с текстом — Google строит из
 * таких списков дополнительные ссылки прямо в выдаче.
 *
 * Короткие статьи (меньше четырёх разделов) оглавления не получают: список из
 * двух пунктов занимает экран и не помогает никому.
 */
export function buildTableOfContents(html: string): { html: string; toc: string } {
  const headings = [...html.matchAll(/<h2\b([^>]*)>([\s\S]*?)<\/h2>/gi)];
  if (headings.length < 4) return { html, toc: "" };

  let out = "";
  let cursor = 0;
  const items: string[] = [];

  headings.forEach((m, i) => {
    const [whole, attrs, inner] = m;
    const start = m.index ?? 0;
    const anchor = headingAnchor(inner, i);
    items.push(`<li><a href="#${anchor}">${inner.replace(/<[^>]+>/g, "").trim()}</a></li>`);
    out += html.slice(cursor, start) + `<h2${attrs} id="${anchor}">${inner}</h2>`;
    cursor = start + whole.length;
  });
  out += html.slice(cursor);

  const toc =
    `<div class="article-toc"><p class="article-toc-title">В статье</p><ul>` + items.join("") + `</ul></div>`;
  return { html: out, toc };
}

// ─── Карточки объектов из каталога ───

export interface ListingCard {
  id: number;
  title: string;
  price: number;
  rooms: number;
  area: number;
  location: string;
  photo?: string | null;
}

/** Карточка объекта: то же, что видит человек в каталоге, только внутри статьи. */
export function buildListingCardHtml(listing: ListingCard): string {
  const price = `${listing.price.toLocaleString("ru-RU")} сомони`;
  const meta = [`${listing.rooms}-комн.`, `${listing.area} м²`, listing.location].filter(Boolean).join(" · ");
  const photo = listing.photo
    ? `<img src="${escapeHtml(listing.photo)}" alt="${escapeHtml(listing.title)}" loading="lazy" />`
    : "";
  return (
    `<a class="article-listing" href="/listing/${listing.id}">${photo}` +
    `<span class="article-listing-body">` +
    `<span class="article-listing-title">${escapeHtml(listing.title)}</span>` +
    `<span class="article-listing-meta">${escapeHtml(meta)}</span>` +
    `<span class="article-listing-price">${escapeHtml(price)}</span>` +
    `<span class="article-listing-cta">Смотреть объект</span>` +
    `</span></a>`
  );
}

/**
 * Ставит карточку объекта после абзаца, в котором на него ссылается текст.
 *
 * Ссылку в тексте оставляем: карточка — дополнение, а не замена. Больше двух
 * карточек на статью не ставим — иначе текст превращается в витрину.
 */
export function insertListingCards(html: string, listings: ListingCard[], limit = 2): string {
  let out = html;
  let placed = 0;

  for (const listing of listings) {
    if (placed >= limit) break;
    const linkAt = out.search(new RegExp(`href=["']/listing/${listing.id}(?:[?#][^"']*)?["']`, "i"));
    if (linkAt < 0) continue;
    // Конец абзаца со ссылкой; нет закрывающего </p> — ставим сразу после ссылки.
    const paragraphEnd = out.indexOf("</p>", linkAt);
    const cut = paragraphEnd >= 0 ? paragraphEnd + 4 : out.indexOf(">", linkAt) + 1;
    out = out.slice(0, cut) + buildListingCardHtml(listing) + out.slice(cut);
    placed++;
  }

  return out;
}

/** Вставляет вынесенную мысль перед вторым <h2> — в начале статьи, но не над ней. */
export function insertPullQuote(html: string, quoteHtml: string): string {
  if (!quoteHtml) return html;
  const headings = [...html.matchAll(/<h2\b[^>]*>/gi)];
  const anchor = headings[1]?.index;
  if (anchor === undefined) return html + quoteHtml;
  return html.slice(0, anchor) + quoteHtml + html.slice(anchor);
}
