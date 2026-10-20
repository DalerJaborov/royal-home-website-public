import sanitizeHtml from "sanitize-html";

/**
 * Серверная санитизация HTML статей блога перед сохранением в БД: фронтенд
 * рендерит contentHtml через dangerouslySetInnerHTML, поэтому здесь настоящий
 * parse-based allowlist (библиотека sanitize-html), а не regex-стрижка — регулярки
 * обходились трюками вида <img/onerror=...> и незакавыченным javascript:.
 * Разрешено только то, что реально нужно статье.
 */
const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "h2", "h3", "h4", "p", "br", "hr",
    "ul", "ol", "li",
    "strong", "b", "em", "i", "u", "s",
    "blockquote", "a", "img",
    "table", "thead", "tbody", "tr", "th", "td",
    "figure", "figcaption", "code", "pre",
    // Блоки оформления статьи: «Коротко», плитки с цифрами (см. lib/article-layout.ts).
    "div", "span",
  ],
  allowedAttributes: {
    // id у заголовков — якоря оглавления; class у ссылки — карточка объекта.
    a: ["href", "title", "class"],
    h2: ["id"],
    h3: ["id"],
    img: ["src", "alt", "title", "width", "height", "loading"],
    th: ["colspan", "rowspan"],
    td: ["colspan", "rowspan"],
    div: ["class"],
    span: ["class"],
    p: ["class"],
    blockquote: ["class"],
    figure: ["class"],
  },
  /**
   * Классы — строгим списком, а не «любой class»: это наши собственные блоки
   * оформления, и произвольный класс из ответа модели всё равно не имел бы стилей,
   * зато мог бы притянуть чужие (например утилиты Tailwind) и сломать вёрстку.
   * Список обязан совпадать с классами в lib/article-layout.ts и стилями в src/index.css.
   */
  allowedClasses: {
    div: ["article-takeaways", "article-key-facts", "article-fact", "article-toc"],
    p: ["article-takeaways-title", "article-toc-title"],
    span: [
      "article-fact-value",
      "article-fact-label",
      "article-listing-body",
      "article-listing-title",
      "article-listing-meta",
      "article-listing-price",
      "article-listing-cta",
    ],
    a: ["article-listing"],
    blockquote: ["article-quote"],
    figure: ["article-figure"],
  },
  // Только безопасные схемы: javascript:, data:, vbscript: отбрасываются парсером.
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedSchemesByTag: { img: ["http", "https"] },
  allowProtocolRelative: false,
  disallowedTagsMode: "discard",
};

export function sanitizeArticleHtml(html: string): string {
  return sanitizeHtml(html, OPTIONS).trim();
}
