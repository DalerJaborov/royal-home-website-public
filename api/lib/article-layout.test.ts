import { describe, expect, it } from "vitest";
import {
  buildFigureHtml,
  buildKeyFactsHtml,
  buildPullQuoteHtml,
  buildTakeawaysHtml,
  insertAfterSection,
  insertPullQuote,
  keepOnlyAllowedLinks,
  buildTableOfContents,
  insertListingCards,
} from "./article-layout";
import { sanitizeArticleHtml } from "./sanitize-html";

const ARTICLE =
  "<h2>Сколько стоит однушка в Сино</h2><p>Первый раздел.</p>" +
  "<h2>Что с ипотекой</h2><p>Второй раздел.</p>" +
  "<h2>Выводы</h2><p>Третий раздел.</p>";

describe("блоки статьи", () => {
  it("«Коротко» собирается из выводов", () => {
    const html = buildTakeawaysHtml(["Средняя цена 13 420 сомони", "В Сино 19 объектов"]);
    expect(html).toContain("article-takeaways");
    expect(html).toContain("Средняя цена 13 420 сомони");
  });

  it("одного вывода мало — блок не нужен", () => {
    expect(buildTakeawaysHtml(["Одна строка"])).toBe("");
    expect(buildKeyFactsHtml([{ value: "1", label: "штука" }])).toBe("");
  });

  it("текст от модели экранируется, а не попадает в разметку", () => {
    const html = buildTakeawaysHtml(["<script>alert(1)</script>", "Второй пункт"]);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("короткую цитату не выносим", () => {
    expect(buildPullQuoteHtml("Мало")).toBe("");
    expect(buildPullQuoteHtml("Цена метра в Шохмансуре впервые обогнала центр города")).toContain("article-quote");
  });
});

describe("вставка в текст статьи", () => {
  it("картинка встаёт после нужного раздела, перед следующим заголовком", () => {
    const figure = buildFigureHtml("/api/uploads/x.webp", "Подпись");
    const out = insertAfterSection(ARTICLE, "Сколько стоит однушка в Сино", figure);
    expect(out.indexOf("article-figure")).toBeGreaterThan(out.indexOf("Первый раздел"));
    expect(out.indexOf("article-figure")).toBeLessThan(out.indexOf("Что с ипотекой"));
  });

  // Модель называет заголовок своими словами: другое тире, другой регистр,
  // лишняя точка. Без «сжатого» сравнения картинка молча уезжала бы в конец.
  it("заголовок узнаётся, даже если написан иначе", () => {
    const out = insertAfterSection(ARTICLE, "сколько стоит однушка в сино?", "<hr />");
    expect(out.indexOf("<hr />")).toBeLessThan(out.indexOf("Что с ипотекой"));
  });

  it("незнакомый заголовок — блок уходит в конец, а не теряется", () => {
    const out = insertAfterSection(ARTICLE, "Раздела с таким названием нет", "<hr />");
    expect(out.endsWith("<hr />")).toBe(true);
  });

  it("цитата встаёт перед вторым разделом", () => {
    const out = insertPullQuote(ARTICLE, buildPullQuoteHtml("Цена метра в Шохмансуре обогнала центр столицы"));
    expect(out.indexOf("article-quote")).toBeLessThan(out.indexOf("Что с ипотекой"));
    expect(out.indexOf("article-quote")).toBeGreaterThan(out.indexOf("Первый раздел"));
  });
});

// Классы блоков разрешены санитайзером поимённо: разойдутся списки — блок
// останется без стилей, и понять это по внешнему виду будет невозможно.
describe("санитайзер пропускает блоки оформления", () => {
  it("сохраняет классы и картинку врезки", () => {
    const html =
      buildTakeawaysHtml(["Первый вывод", "Второй вывод"]) +
      buildKeyFactsHtml([
        { value: "13 420 сомони", label: "средняя цена м²" },
        { value: "19", label: "объектов в Сино" },
      ]) +
      buildPullQuoteHtml("Цена метра в Шохмансуре впервые обогнала центр города") +
      buildFigureHtml("/api/uploads/x.webp", "Подпись");
    const clean = sanitizeArticleHtml(html);
    for (const cls of [
      "article-takeaways",
      "article-takeaways-title",
      "article-key-facts",
      "article-fact",
      "article-fact-value",
      "article-fact-label",
      "article-quote",
      "article-figure",
    ]) {
      expect(clean).toContain(cls);
    }
    expect(clean).toContain('src="/api/uploads/x.webp"');
  });
});

// Первая же статья с внутренними ссылками получила три выдуманных адреса
// (/search/sino/3-komnatnye и подобные) — все давали 404.
describe("ссылки только на существующие адреса", () => {
  const allowed = ["/listings", "/listing/12", "/mortgage"];

  it("выдуманный адрес разворачивается в текст, подпись остаётся", () => {
    const { html, removed } = keepOnlyAllowedLinks(
      '<p>Смотрите <a href="/search/sino/3-komnatnye">трёхкомнатные в Сино</a>.</p>',
      allowed
    );
    expect(html).toBe("<p>Смотрите трёхкомнатные в Сино.</p>");
    expect(removed).toEqual(["/search/sino/3-komnatnye"]);
  });

  it("настоящие адреса сайта остаются ссылками", () => {
    const src = '<p><a href="/listings">каталог</a> и <a href="/listing/12">объект</a></p>';
    expect(keepOnlyAllowedLinks(src, allowed).html).toBe(src);
  });

  it("параметры и якорь не мешают узнать адрес", () => {
    const src = '<p><a href="/listings?rooms=3#top">трёхкомнатные</a></p>';
    expect(keepOnlyAllowedLinks(src, allowed).html).toBe(src);
  });

  // Ссылки на источники новостей — то, за что статью и цитируют: их не трогаем.
  it("внешние ссылки не трогаем", () => {
    const src = '<p>по данным <a href="https://asiaplustj.info/">Азия-Плюс</a></p>';
    expect(keepOnlyAllowedLinks(src, allowed).html).toBe(src);
  });
});

describe("оглавление", () => {
  const long =
    "<h2>Раз</h2><p>a</p><h2>Два</h2><p>b</p><h2>Три</h2><p>c</p><h2>Четыре</h2><p>d</p>";

  it("собирается у длинной статьи, заголовки получают якоря", () => {
    const { html, toc } = buildTableOfContents(long);
    expect(toc).toContain("article-toc");
    expect(toc.match(/<li>/g)).toHaveLength(4);
    expect(html).toContain('id="razdel-1');
    // Ссылка оглавления должна попадать в существующий якорь.
    const anchor = /href="#([^"]+)"/.exec(toc)![1];
    expect(html).toContain(`id="${anchor}"`);
  });

  // Список из двух пунктов занимает экран и не помогает никому.
  it("у короткой статьи оглавления нет", () => {
    const short = "<h2>Раз</h2><p>a</p><h2>Два</h2><p>b</p>";
    expect(buildTableOfContents(short).toc).toBe("");
  });

  it("якоря оглавления переживают проверку ссылок", () => {
    const { toc } = buildTableOfContents(long);
    expect(keepOnlyAllowedLinks(toc, []).html).toBe(toc);
  });
});

describe("карточка объекта в статье", () => {
  const listing = {
    id: 12,
    title: "3-комнатная в центре",
    price: 1460000,
    rooms: 3,
    area: 95,
    location: "Исмоили Сомони",
    photo: "/api/uploads/p.webp",
  };

  it("встаёт после абзаца со ссылкой на этот объект", () => {
    const html = '<p>Смотрите <a href="/listing/12">объект</a>.</p><p>Дальше текст.</p>';
    const out = insertListingCards(html, [listing]);
    expect(out.indexOf("article-listing")).toBeGreaterThan(out.indexOf("объект"));
    expect(out.indexOf("article-listing")).toBeLessThan(out.indexOf("Дальше текст"));
    // Разряды toLocaleString разделяет неразрывным пробелом — сравниваем по «сжатому» виду.
    expect(out.replace(/\s/g, " ")).toContain("1 460 000 сомони");
  });

  it("объект без ссылки в тексте карточку не получает", () => {
    const html = "<p>Текст без ссылок.</p>";
    expect(insertListingCards(html, [listing])).toBe(html);
  });

  // Иначе статья превращается в витрину.
  it("больше двух карточек не ставим", () => {
    const many = [12, 13, 14].map((id) => ({ ...listing, id }));
    const html = many.map((l) => `<p><a href="/listing/${l.id}">объект</a></p>`).join("");
    const out = insertListingCards(html, many);
    expect(out.match(/article-listing"/g)).toHaveLength(2);
  });
});
