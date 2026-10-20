import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { articleQualityProblems, allowsMarketStatistics, duplicatesRecentTitle, excludesAutomaticTopic, isPrimarySourceUrl, selectEditorialBrief } from "./blog-editorial-policy";
import type { ArticleForQuality, EditorialBrief } from "./blog-editorial-policy";
import { coverStrategy, planArticlePhoto } from "./blog-photo-plan";
import { chooseRelevantOwnedReel, ownedReelHtml } from "./blog-owned-media";

describe("Editorial safety and variety", () => {
  it("excludes mortgages in Russian, transliteration, category and English", () => {
    for (const topic of ["Ипотека или рассрочка", "ипотечный кредит", "ipoteka-dushanbe", "mortgage loan", "Жилищный кредит"]) expect(excludesAutomaticTopic(topic)).toBe(true);
    expect(excludesAutomaticTopic("Приёмка квартиры и качество ремонта")).toBe(false);
  });
  it("recognizes repeated price questions despite punctuation and year", () => {
    expect(duplicatesRecentTitle("Цены на двухкомнатные квартиры в Сино: 2026", ["Сколько стоит двухкомнатная квартира в районе Сино в 2025 году"])).toBe(true);
  });
  it("moves away from recent price clones and ignores a forbidden CMS priority", () => {
    const brief = selectEditorialBrief(["Цены квартир в Сино", "Стоимость квадратного метра Душанбе", "Ипотека или рассрочка"], ["Ипотека в Душанбе"]);
    expect(brief.family).not.toBe("pricing");
    expect(excludesAutomaticTopic(brief.title)).toBe(false);
  });
  it("does not treat a hostname embedded in an attacker domain as an official source", () => {
    expect(isPrimarySourceUrl("https://www.memor.pro/")).toBe(true);
    expect(isPrimarySourceUrl("https://memor.pro.evil.example/news")).toBe(false);
    expect(isPrimarySourceUrl("https://example.com/?source=stat.tj")).toBe(false);
  });
  it("blocks unsupported financial guarantees and numbers before publishing", () => {
    const article = { title: "Выбор жилья", excerpt: "План просмотра", metaTitle: "Выбор жилья", metaDescription: "Проверка жилья", category: "Покупка", faq: [],
      contentHtml: "<h2>Осмотр</h2><p>Гарантированный доход 20%. Цена ремонта 9999 сомони.</p><h2>Проверка</h2><h2>Вопросы</h2>", keyFacts: [{ value: "3 дня", label: "регистрация сделки" }] };
    const problems = articleQualityProblems(article, [], new Set([800000]));
    expect(problems.some((problem) => problem.includes("денежная величина"))).toBe(true);
    expect(problems.some((problem) => problem.includes("финансовое"))).toBe(true);
    expect(problems.some((problem) => problem.includes("ключевая цифра"))).toBe(true);
  });
  it("rejects a structural diagnosis instead of treating visible cracks as proof", () => {
    const article = { title: "Осмотр", excerpt: "Проверка", metaTitle: "Осмотр", metaDescription: "Проверка", faq: [],
      contentHtml: "<h2>Осмотр</h2><p>Свежие диагональные трещины говорят об осадке фундамента.</p><h2>Проверка</h2><h2>Вопросы</h2>" };
    expect(articleQualityProblems(article, [], new Set()).some((problem) => problem.includes("инженерный"))).toBe(true);
    article.contentHtml = article.contentHtml.replace("говорят об осадке фундамента", "могут быть признаком проблемы; причину определяет инженер");
    expect(articleQualityProblems(article, [], new Set()).some((problem) => problem.includes("инженерный"))).toBe(false);
  });
  it("rejects the complete live light/noise preview even when every catalog price is allowed", () => {
    const preview = JSON.parse(readFileSync(new URL("./blog-editorial-policy.live-preview.test-fixture.json", import.meta.url), "utf8")) as { article: ArticleForQuality; brief: EditorialBrief };
    const problems = articleQualityProblems(preview.article, [], new Set([12479, 16027, 15699, 10013, 19, 11, 5, 3]), preview.brief);
    for (const claim of ["гарантия", "инженерный", "техническое число", "локальное", "приписана", "ценовая статистика"]) expect(problems.some((problem) => problem.includes(claim))).toBe(true);
  });
  it("separates real faults in the second live draft from safe observation/referral language", () => {
    const preview = JSON.parse(readFileSync(new URL("./blog-editorial-policy.observational-preview.test-fixture.json", import.meta.url), "utf8")) as { article: ArticleForQuality; brief: EditorialBrief };
    const problems = articleQualityProblems(preview.article, [], new Set(), preview.brief);
    for (const evidence of ["пару недель", "насколько плотно створки", "указывать на щели", "намного быстрее"]) expect(problems.some((problem) => problem.includes(evidence))).toBe(true);
    for (const safe of ["Оценивать естественный свет необходимо", "требуют консультации профильного", "Не ставьте инженерных диагнозов", "как безопасно проверить звукоизоляцию", "Можно ли самостоятельно определить исправность вентиляции?"]) expect(problems.some((problem) => problem.includes(safe))).toBe(false);
  });
  it("allows the useful length of the real Pro checklist while still blocking its factual mistakes", () => {
    const preview = JSON.parse(readFileSync(new URL("./blog-editorial-policy.pro-preview.test-fixture.json", import.meta.url), "utf8")) as { article: ArticleForQuality; brief: EditorialBrief };
    const problems = articleQualityProblems(preview.article, [], new Set(), preview.brief);
    expect(problems).not.toContain("слишком мало полезного основного текста");
    expect(problems.some((problem) => problem.includes("Южная сторона даст максимум"))).toBe(true);
    expect(problems.some((problem) => problem.includes("всегда обращаем внимание"))).toBe(true);
    expect(problems.some((problem) => problem.includes("Запах сырости может быть признаком проблем"))).toBe(false);
    // Changing the title/format does not exempt factual claims. A longer format
    // retains its completeness floor; this is a local editorial policy only.
    expect(articleQualityProblems(preview.article, [], new Set(), {...preview.brief,format:"развёрнутый анализ"})).toContain("слишком мало полезного основного текста");
  });
  it("rechecks the exact final received Pro article without changing its original rejection record", () => {
    const preview = JSON.parse(readFileSync(new URL("./blog-editorial-policy.final-received-preview.test-fixture.json", import.meta.url), "utf8")) as { article: ArticleForQuality; brief: EditorialBrief; rawQualityProblems: string[] };
    expect(preview.rawQualityProblems).toHaveLength(1);
    expect(preview.rawQualityProblems[0]).toContain("окончательное решение");
    expect(preview.rawQualityProblems[0]).toContain("Хорошая вентиляция необходима");
    expect(articleQualityProblems(preview.article, [], new Set(), preview.brief)).toEqual([]);
    expect(preview.rawQualityProblems).toHaveLength(1);
  });
  it.each([
    ["Застекленная лоджия забирает до трети дневного света.", "техническое число"],
    ["Длинная комната более шести метров оставляет дальнюю зону в темноте.", "техническое число"],
    ["Зазор под дверью должен быть 1,5–2 сантиметра.", "техническое число"],
    ["Для тяги необходим зазор 20 мм под дверью.", "техническое число"],
    ["Если слышен разговор через стену, перегородка выполнена из тонкого блока.", "инженерный"],
    ["Если слышны машины, уплотнители рассохлись либо оконный профиль смонтирован с пустотами.", "инженерный"],
    ["Квартиры с окнами на одну сторону требуют принудительной вентиляции.", "инженерный"],
    ["Спальня с окнами во двор гарантирует спокойный ночной сон.", "гарантия"],
    ["Двор не гарантирует тишину, но эти окна гарантируют спокойный сон.", "гарантия"],
    ["Покупка этой спальни — гарантия тишины.", "гарантия"],
    ["Эти окна обеспечивают полную тишину.", "инженерный"],
    ["В новостройках Душанбе вентиляция часто работает с перебоями.", "локальное"],
    ["Наша команда помогает выявить скрытые строительные дефекты.", "приписана"],
    ["ROYAL HOME проводит техническую экспертизу квартиры.", "приписана"],
    ["Наши специалисты проверяют техническое состояние здания.", "приписана"],
    ["Мы проводим замеры шума перед покупкой квартиры.", "приписана"],
    ["Шум может указывать на тонкие перегородки.", "инженерный"],
    ["Проверка шума позволяет сразу понять, насколько плотно створки прилегают к рамам.", "инженерный"],
    ["Квартиры с такими окнами проветриваются намного быстрее линейных планировок.", "инженерный"],
    ["Косметический ремонт можно переделать за пару недель.", "срок технических"],
    ["Затхлый воздух требует консультации специалиста и принудительной вентиляции.", "инженерный"],
    ["Южная сторона даст максимум освещения весь день.", "инженерный"],
    ["Наши специалисты всегда выявляют недостатки при просмотре.", "регулярная практика"],
    ["Для окон необходим зазор в 2 см.", "техническое число"],
    ["Оконный профиль должен иметь зазор в 2 см.", "техническое число"],
    ["Хорошая вентиляция необходима для комфортного проживания, поэтому нужен зазор 2 см.", "техническое число"],
  ])("requires review for a class of unsupported claims: %s", (claim, expected) => {
    const article = { title: "Осмотр", excerpt: "Проверка", metaTitle: "Осмотр", metaDescription: "Проверка", faq: [], contentHtml: `<h2>Осмотр</h2><p>${claim}</p><h2>Проверка</h2><h2>Вопросы</h2>` };
    expect(articleQualityProblems(article, [], new Set()).some((problem) => problem.includes(expected))).toBe(true);
  });
  it("checks sidebar and FAQ claims as strictly as body paragraphs", () => {
    const article = { title: "Осмотр", excerpt: "Проверка", metaTitle: "Осмотр", metaDescription: "Проверка", faq: [{q: "Тишина?", a: "Окна гарантируют тишину."}], contentHtml: "<h2>Осмотр</h2><h2>Проверка</h2><h2>Вопросы</h2>", takeaways: ["Вентиляция требует зазора 2 см."], pullQuote: "Наша команда выявляет скрытые строительные дефекты." };
    const problems = articleQualityProblems(article, [], new Set());
    for (const kind of ["гарантия", "техническое число", "приписана"]) expect(problems.some((problem) => problem.includes(kind))).toBe(true);
  });
  it("allows safe observations, ordinary list quantities, product types and explicit limits", () => {
    const article = { title: "Просмотр", excerpt: "Подготовьте вопросы", metaTitle: "Просмотр", metaDescription: "Подготовка", faq: [], keyFacts: [], contentHtml: "<h2>Свет</h2><p>Посмотрите, насколько светло в дальней части комнаты. Сравните ощущения при открытом и закрытом окне. Оценивать естественный свет необходимо в дневное время.</p><h2>Шум</h2><p>Запишите 3 вопроса продавцу. Уточните тип двухкамерного стеклопакета. Попросите организовать повторный просмотр.</p><h2>Вентиляция</h2><p>По просмотру нельзя определить причину шума. Наблюдение не позволяет определить герметичность окна. Трещины могут быть признаком проблемы; причину определяет инженер. Двор не гарантирует тишину: прислушайтесь во время повторного визита. Затхлый воздух или пятна сырости требуют консультации профильного специалиста.</p>" };
    expect(articleQualityProblems(article, [], new Set(), {title:article.title, family:"viewing"}).filter((problem) => !problem.includes("слишком мало"))).toEqual([]);
  });
  it("does not force price statistics into useful practical topics", () => {
    expect(allowsMarketStatistics({family:"viewing", title:"Как оценить свет, шум и проветривание"})).toBe(false);
    expect(allowsMarketStatistics({family:"pricing", title:"Как сравнить цены квартир"})).toBe(true);
    expect(allowsMarketStatistics({family:"district", title:"Как выбрать район по маршруту"})).toBe(false);
    const article = { title: "Свет и шум", excerpt: "Просмотр", metaTitle: "Свет и шум", metaDescription: "Просмотр", faq: [], contentHtml: "<h2>Свет</h2><p>Средняя цена 12479 сомони.</p><h2>Шум</h2><h2>Вопросы</h2>", keyFacts: [{value:"19 квартир",label:"в активной выборке Сино"}] };
    expect(articleQualityProblems(article, [], new Set([12479,19]), {family:"viewing",title:article.title})).toContain("ценовая статистика или ключевые цифры не относятся к выбранному практическому вопросу");
    expect(articleQualityProblems(article, [], new Set([12479,19]), {family:"pricing",title:"Цены квартир"})).not.toContain("ценовая статистика или ключевые цифры не относятся к выбранному практическому вопросу");
  });
});

describe("Hybrid visual plan", () => {
  it("uses real catalog photos for actual-market topics and neutral illustrations for moving", () => {
    expect(coverStrategy("district", "mixed")).toBe("catalog");
    expect(coverStrategy("moving", "mixed")).toBe("neutral-illustration");
    expect(coverStrategy("moving", "photo")).toBe("catalog");
  });
  it("rejects tiny thumbnails, matches a real district, and never repeats a cover", async () => {
    const listings = [{ id: 1, title: "Сино", location: "Сино", rooms: 2, imageUrls: ["tiny", "sino-large", "sino-second"] }, { id: 2, title: "Другая", location: "Сомони", rooms: 2, imageUrls: ["other-large"] }];
    const used = new Set<string>();
    const inspect = async (url: string) => ({ width: url === "tiny" ? 512 : 1200, height: 800, entropy: 5 });
    const first = await planArticlePhoto({ title: "Двухкомнатные квартиры в Сино" }, listings, used, inspect);
    expect(first?.sourcePhoto).toBe("sino-large");
    expect(first?.sourceHref).toBe("/listing/1");
    const second = await planArticlePhoto({ title: "Второй вопрос" }, listings, used, inspect);
    expect(second?.sourcePhoto).toBe("other-large");
  });
  it("uses a relevant owned reel with stable permalink, never expiring CDN media in article HTML", () => {
    const reel = { id: "12345", url: "https://www.instagram.com/reel/ABC123/", cover: "https://cdninstagram.com/expires.jpg", caption: "Планировка и ремонт", fullCaption: "Планировка и ремонт квартиры", videoUrl: "https://cdninstagram.com/expires.mp4" };
    const picked = chooseRelevantOwnedReel("Планировка и ремонт для семьи", [reel]);
    expect(picked).toBe(reel);
    const html = ownedReelHtml(picked);
    expect(html).toContain("/reel/ABC123/");
    expect(html).not.toContain("cdninstagram");
    expect(chooseRelevantOwnedReel("Как проверить документы", [reel])).toBeNull();
  });
});
