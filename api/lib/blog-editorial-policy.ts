/** Automatic articles answer a distinct practical question. These are editorial
 * hypotheses, not measured Search Console keywords or promises of rankings.
 */
export const MORTGAGE_PATTERN = /ипотек|ипотеч|ipotek|mortgag|жилищн.{0,24}кредит|кредит.{0,24}(жиль|квартир)/i;
export const excludesAutomaticTopic = (text: string) => MORTGAGE_PATTERN.test(text);

export interface EditorialBrief { title: string; category: string; family: string; format: string }
/** Catalog prices answer a pricing question; their accuracy does not make them
 * relevant to a checklist about daylight, moving, maintenance or documents. */
export function allowsMarketStatistics(brief: Pick<EditorialBrief, "title" | "family">): boolean {
  return ["pricing", "negotiation", "comparison", "district", "commercial"].includes(brief.family) && /цен|стоим|сколько.{0,12}стоит|бюджет/i.test(brief.title);
}
export const EDITORIAL_BRIEFS: EditorialBrief[] = [
  { title: "Как проверить квартиру на просмотре в Душанбе", category: "Покупка", family: "viewing", format: "чек-лист осмотра" },
  { title: "Свободная планировка в Душанбе: что проверить до покупки", category: "Покупка", family: "layout", format: "разбор рисков и вопросов продавцу" },
  { title: "Как подготовить квартиру в Душанбе к фотографированию и показу", category: "Продажа", family: "selling", format: "практический план для продавца" },
  { title: "Как выбрать район Душанбе под ежедневный маршрут семьи", category: "Районы", family: "district", format: "сценарии семьи без рейтинга районов" },
  { title: "Ремонт в квартире-коробке: что проверить до покупки в Душанбе", category: "Ремонт", family: "renovation", format: "чек-лист инженерных вопросов" },
  { title: "Новостройка или готовая квартира в Душанбе: сравнение задач покупателя", category: "Покупка", family: "comparison", format: "сравнение двух сценариев" },
  { title: "Коммерческое помещение в Душанбе: вопросы перед просмотром", category: "Инвестиции", family: "commercial", format: "чек-лист назначения и доступа без обещаний доходности" },
  { title: "Что спросить о воде, лифте и обслуживании дома в Душанбе", category: "Покупка", family: "utilities", format: "вопросы владельцу и обслуживающей организации" },
  { title: "Как обсуждать цену квартиры в Душанбе после осмотра", category: "Покупка", family: "negotiation", format: "пошаговые переговоры без гарантий скидки" },
  { title: "Как сравнить цены объявлений о квартирах в Душанбе", category: "Аналитика", family: "pricing", format: "метод сравнения предложения; не статистика сделок" },
  { title: "Как проверить свет, шум и вентиляцию квартиры в Душанбе", category: "Покупка", family: "viewing", format: "наблюдения на повторном просмотре" },
  { title: "Планировка для семьи: как сравнить квартиры в Душанбе", category: "Покупка", family: "layout", format: "сравнение бытовых сценариев" },
  { title: "Что подготовить продавцу квартиры в Душанбе до первого показа", category: "Продажа", family: "selling", format: "чек-лист объявления и организации просмотра" },
  { title: "Как оценить двор и подъезд дома в Душанбе перед покупкой", category: "Районы", family: "district", format: "маршрут личной проверки без выдуманных расстояний" },
  { title: "Готовый ремонт или квартира без отделки в Душанбе", category: "Ремонт", family: "renovation", format: "сравнение расходов без придуманных смет" },
  { title: "Этаж и лифт: как выбрать квартиру в Душанбе под свой образ жизни", category: "Покупка", family: "comparison", format: "вопросы и компромиссы без универсального лучшего этажа" },
  { title: "Как подготовить квартиру в Душанбе для будущего арендатора", category: "Инвестиции", family: "rental", format: "практический чек-лист без выдуманной доходности" },
  { title: "Переезд в новую квартиру в Душанбе: порядок бытовых задач", category: "Ремонт", family: "moving", format: "план действий без сроков и выдуманных тарифов" },
  { title: "Переезд в Душанбе из другого региона Таджикистана: как подготовить поиск жилья", category: "Покупка", family: "moving", format: "практический маршрут поиска без сравнения непроверенных региональных цен" },
  { title: "Как семье в Таджикистане составить требования к будущему дому", category: "Покупка", family: "layout", format: "сценарии жизни и вопросы для просмотра; каталог только Душанбе" },
  { title: "Парковка и доступ во двор: вопросы покупателя квартиры в Душанбе", category: "Районы", family: "utilities", format: "личная проверка доступа без неподтверждённых правовых норм" },
];

function words(title: string): Set<string> {
  return new Set(title.toLowerCase().replace(/ё/g, "е").replace(/20\d\d/g, "").match(/[а-яa-z0-9]+/g)?.filter((word) =>
    word.length > 2 && !["как", "что", "для", "перед", "после", "при", "или", "под", "его", "это"].includes(word) && !/^(душанб|квартир|район)/.test(word)
  ).map((word) => /^(цен|стоим|стоит)/.test(word) ? "цена" : word.slice(0, 6)) ?? []);
}
export function duplicatesRecentTitle(title: string, recent: string[]): boolean {
  const candidate = words(title);
  return recent.some((previous) => {
    const other = words(previous);
    const overlap = [...candidate].filter((word) => other.has(word)).length;
    return overlap >= 2 && overlap / Math.max(1, Math.min(candidate.size, other.size)) >= 0.8;
  });
}
const FAMILY_PATTERNS: Record<string, RegExp> = {
  viewing: /просмотр|осмотр|провер.{0,12}квартир|свет|шум|вентиляц/i,
  layout: /планиров/i, selling: /продат|продаж|продав|показ|фотограф/i,
  district: /район|двор|подъезд/i, renovation: /ремонт|отделк|коробк/i,
  comparison: /новостро|вторич|этаж|лифт|готов.{0,12}квартир/i,
  commercial: /коммерч|помещен/i, utilities: /вод[аы]|лифт|обслужив/i,
  negotiation: /торг|скидк|обсужд.{0,12}цен/i, pricing: /цен|стоим|стоит/i,
  rental: /аренд|сдават|сдать/i, moving: /переезд/i,
};
export function selectEditorialBrief(recentTitles: string[], priorities: string[] = []): EditorialBrief {
  const usable = EDITORIAL_BRIEFS.filter((brief) => !duplicatesRecentTitle(brief.title, recentTitles));
  const safePriorities = priorities.filter((title) => !excludesAutomaticTopic(title) && !duplicatesRecentTitle(title, recentTitles) &&
    /квартир|жиль|недвиж|дом|район|ремонт|переезд|планиров|лифт|обслужив/i.test(title) &&
    !/знаменит|звезд|звёзд|гаджет|iphone|криптовалют|политик|гороскоп/i.test(title));
  const score = (brief: EditorialBrief) => recentTitles.slice(0, 8).reduce((sum, title, index) =>
    sum + (FAMILY_PATTERNS[brief.family]?.test(title) ? 8 - index : 0), 0);
  usable.sort((a, b) => score(a) - score(b));
  const chosen = usable[0];
  if (!chosen) throw new Error("Все редакционные темы уже раскрыты: нужен новый проверенный вопрос.");
  // Priorities are hints from CMS, not proof of query demand. They may only
  // choose a safe, distinct topic within a family that has not just dominated.
  const priority = safePriorities.find((title) => FAMILY_PATTERNS[chosen.family]?.test(title));
  return priority ? { ...chosen, title: priority } : chosen;
}

export const PRIMARY_SOURCE_HOSTS = ["memor.pro", "stat.tj", "dushanbe.tj", "andoz.tj", "adlia.tj", "mmih.tj", "president.tj"];
/** Root resource inspected directly on 2026-10-15. This establishes the resource,
 * never the approval status of a particular building or block.
 */
export const VERIFIED_RESOURCE_LINKS = ["https://www.memor.pro/", "https://memor.pro/"];
export function isPrimarySourceUrl(value: string): boolean {
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password && PRIMARY_SOURCE_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`)); }
  catch { return false; }
}

export interface ArticleForQuality {
  title: string; slug?: string; category?: string; contentHtml: string; excerpt: string;
  metaTitle: string; metaDescription: string; faq: Array<{ q: string; a: string }>;
  takeaways?: string[]; keyFacts?: Array<{ value: string; label: string }>; pullQuote?: string;
}
/** These are claim classes, not a factual verifier. Automatic text has no
 * verified technical specification or inspection report: it may describe what
 * a reader can observe/ask, but cannot diagnose causes or prescribe thresholds. */
function unsupportedClaimProblems(parts: string[]): string[] {
  const sentences = parts.flatMap((part) => part.replace(/<\/(?:p|h[1-6]|li|tr)>/gi, "\n").replace(/<[^>]+>/g, " ").split(/(?<=[.!?])\s+|\n+|;|\s+(?:но|однако)\s+/)).map((part) => part.trim()).filter(Boolean);
  const problems: string[] = [];
  const engineering = /вентиляц|вытяж|тяг[аиу]|воздух|проветр|свет|освещ|инсоляц|темнот|нагрев|температур|шум|звукоизол|акустич|трещин|деформац|фундамент|несущ|перегород|(?<![а-яё])(?:окн[а-яё]*|окон(?:н[а-яё]*)?|подоконник[а-яё]*)(?![а-яё])|стекл|уплотнит|зазор|плесен|сырост|конденсат|толщин.{0,15}стен|длин.{0,15}комнат|комнат.{0,15}длин|электропроводк|напряжени/i;
  const certainty = /неизбежн|обязаны|обязан|должн|необходим|требуют|требует|придется|придётся|невозможн|прекращается|означает|доказыва|свидетельств|говорят|подтвержда|полностью.{0,20}(?:устраня|исключа)|обеспеч.{0,35}(?:тишин|спокойн|отсутств)/i;
  const diagnostic = /рассох|смонтирован|засорен|засорён|выполнен.{0,30}(?:блок|разрыв)|тонк.{0,15}блок|опрокидывани|осадк|монтажн.{0,15}пустот/i;
  for (const sentence of sentences) {
    const report = (message: string) => problems.push(`${message}: «${sentence.slice(0, 220)}»`);
    const guarantees = [...sentence.matchAll(/гарант(?:ир[а-яё]*|ирован[а-яё]*|и[яиюей][а-яё]*)/gi)];
    const positiveGuarantee = guarantees.some((hit) => !/(?:^|\s)(?:не|нельзя|без)\s+(?:[^\s,;]+\s+){0,2}$/i.test(sentence.slice(0, hit.index)));
    if (positiveGuarantee) report("неподтверждённая гарантия результата или комфорта");
    if (/ремонт|отделк|замен|монтаж/i.test(sentence) && /(?:за|в течение)\s+(?:\d+|пару|несколько|одн[а-яё]*|дв[а-яё]*|тр[а-яё]*|четыр[а-яё]*)\s+(?:дн|день|дня|недел|месяц)/i.test(sentence)) report("срок технических работ не подтверждён согласованной оценкой");
    if (engineering.test(sentence)) {
      const observation = /(?:проверьте|уточните|спросите|обратите внимание|прислушайтесь|оцените|обсудите|пригласите)/i.test(sentence);
      const limitation = /(?:не позволяет|нельзя|невозможно)\s+(?:точно\s+)?(?:определить|установить|диагностировать)|причин.{0,35}(?:определяет|устанавливает|оценит).{0,25}(?:инженер|специалист)|может быть признаком/i.test(sentence);
      const observationInstruction = /^(?:оценивать|наблюдать|слушать|сравнивать)[^.!?]{0,70}(?:необходимо|нужно|следует)\s+(?:при|в|с)\s+/i.test(sentence) && !/принуд|зазор|ремонт|замен|монтаж|установ|размер|высот/i.test(sentence);
      const generalComfort = /^(?:(?:хорошая|качественная|достаточная)\s+)?вентиляция\s+(?:необходима|нужна|важна)\s+для\s+(?:комфортного проживания|комфортной жизни|комфорта)\.?$/i.test(sentence);
      const specialistReferral = /требу(?:ет|ют)\s+(?:консультац|обращен|проверки)[^.!?]{0,45}(?:специалист|инженер)/i.test(sentence) && !/принуд|зазор|норм|долж|монтаж|замен/i.test(sentence);
      const inferenceLimit = /(?:не позволяет|нельзя|невозможно)\s+(?:точно\s+)?(?:определить|установить|диагностировать)/i.test(sentence);
      const openDiagnosticQuestion = /^(?:можно ли|нужно ли|нужна ли|нужен ли|кто|что спросить)[^.!?]*\?$/i.test(sentence);
      const qualifiedRiskReferral = /может быть признаком проблем[^.!?]{0,75}(?:точную причину|причину)[^.!?]{0,35}(?:определяет|установит)[^.!?]{0,30}(?:специалист|инженер)/i.test(sentence) && !/тонк|щел|засор|осадк|принуд|зазор|недостаточ/i.test(sentence);
      const claimedDiagnosis = /(?:позволяет|помогает|можно)[^.!?]{0,35}(?:понять|определить|проверить)[^.!?]{0,55}(?:прилег|исправност|состав|причин|герметич|качеств)|(?:если|при|когда|след|пят|запах|разговор|шум|звук|духот|плесен|трещин|деформац)[^.!?]{0,100}(?:указыв|свидетел|признак)[^.!?]{0,100}(?:щел|тонк|застойн|циркуляц|засор|вентиляц|осадк|фундамент)/i.test(sentence);
      const categoricalComparison = /намного\s+(?:быстрее|лучше|тише|легче)|проветриваются\s+быстрее[^.!?]{0,50}(?:планиров|окн)|(?:все|любые|каждая)[^.!?]{0,70}(?:проветрива|шумоизоляц|безопасн)/i.test(sentence);
      const categoricalOrientation = /(?:восток|восточ|южн|запад|север)[^.!?]{0,100}(?:будет|даст|останется)[^.!?]{0,65}(?:свет|освещ|тени|нагрев|тепл)|(?:максимум|максимальн)[^.!?]{0,45}(?:весь день|всегда)/i.test(sentence) && !/может|зависит|проверьте|оцените|сравните/i.test(sentence);
      if ((certainty.test(sentence) && !limitation && !observationInstruction && !generalComfort && !specialistReferral && !openDiagnosticQuestion) || diagnostic.test(sentence) || (claimedDiagnosis && !inferenceLimit && !openDiagnosticQuestion && !qualifiedRiskReferral) || categoricalComparison || categoricalOrientation) report("неподтверждённый инженерный вывод или обязательное техническое требование");
      if (/\d[\d.,–—\- ]*\s*(?:сантиметр|миллиметр|метр|(?:см|мм|дб)(?![а-яё])|градус)|(?:одн|двух|две|тр[её]х|четыр[её]х|пят|шест|сем|вос[еь]м|девят|десят)[а-яё-]*\s+(?:метр|сантиметр|миллиметр)|до\s+(?:трети|половины|четверти)|вдвое|втрое|\d+\s*%/i.test(sentence)) report("техническое число, размер или доля не подтверждены проверенным источником");
      // Local causes/frequencies cannot be inferred from a catalog of prices.
      if (/(?:Душанбе|Сино|Фирдавси|Шохмансур|Сомони|здесь|в этом районе|в центре города)/i.test(sentence) && /часто|обычно|преоблада|сосредоточ|выше|ниже|максим|с мая|зимой|летом|перебоям|плотност/i.test(sentence) && !observation) report("локальное техническое обобщение не подтверждено наблюдениями или источником");
    }
    const agency = /наша команда|наши специалисты|ROYAL HOME|агентство|мы\s+(?:проводим|проверяем|выявляем|определяем|оказываем|гарантируем)/i.test(sentence);
    const expertService = /скрыт.{0,25}дефект|строительн.{0,25}(?:дефект|экспертиз)|техническ.{0,25}(?:экспертиз|диагност|состояни)|выяв.{0,35}(?:дефект|причин)|диагностир|обследован.{0,20}(?:здан|конструк)|замер.{0,20}(?:шум|вентиляц|радиац|прочност)/i.test(sentence);
    if (agency && expertService && !/не\s+(?:проводим|оказываем|выявляем|выполняем)/i.test(sentence)) report("агентству приписана неподтверждённая диагностика или строительная экспертиза");
    if (agency && /всегда|при каждом|по нашему опыту|в нашей практике/i.test(sentence) && /обращаем внимание|проверя|выявля|провод|обслед|наход|реша/i.test(sentence)) report("неподтверждённая регулярная практика агентства выдана за факт");
  }
  return problems;
}
export function articleQualityProblems(article: ArticleForQuality, recentTitles: string[], allowedNumbers: Set<number>, brief?: Pick<EditorialBrief, "title" | "family"> & Partial<Pick<EditorialBrief, "format">>): string[] {
  const parts = [article.title, article.slug ?? "", article.category ?? "", article.contentHtml, article.excerpt, article.metaTitle, article.metaDescription, article.pullQuote ?? "", ...(article.takeaways ?? []), ...article.faq.map((item) => `${item.q} ${item.a}`), ...(article.keyFacts ?? []).map((item) => `${item.value} ${item.label}`)];
  const text = parts.join(" ").replace(/<[^>]+>/g, " ");
  const problems: string[] = [];
  problems.push(...unsupportedClaimProblems(parts));
  if (brief && !allowsMarketStatistics(brief) && ((article.keyFacts?.length ?? 0) > 0 || /\d[\d\s.,]*\s*(?:сомони|TJS|USD|доллар)|средн.{0,20}цен|цен.{0,20}(?:район|метр)|\d+\s+(?:квартир|объект).{0,25}(?:баз|выборк)/i.test(text))) problems.push("ценовая статистика или ключевые цифры не относятся к выбранному практическому вопросу");
  if (excludesAutomaticTopic(text)) problems.push("ипотечная тема запрещена владельцем");
  if (duplicatesRecentTitle(article.title, recentTitles)) problems.push("тема повторяет существующую статью");
  // An editorial completeness floor, not a Google word-count requirement.
  // A concise checklist can be complete when it has distinct useful sections
  // and several actual actions; padding it to a long essay would make it worse.
  const sectionCount = (article.contentHtml.match(/<h2\b/gi) ?? []).length;
  const actions = new Set((article.contentHtml.replace(/<[^>]+>/g, " ").match(/(?:^|\s)(?:посмотрите|обратите внимание|оцените|сравните|прислушайтесь|спросите|уточните|проверьте|запишите|поговорите|обсудите|попросите)(?=\s|[,.!?:])/gi) ?? []).map((action) => action.trim().toLowerCase()));
  const conciseChecklist = /чек-лист|практическ|наблюден|план действий/i.test(brief?.format ?? "") && sectionCount >= 3 && actions.size >= 3;
  if ((article.contentHtml.replace(/<[^>]+>/g, " ").match(/[а-яёa-z]+/gi) ?? []).length < (conciseChecklist ? 300 : 450)) problems.push("слишком мало полезного основного текста");
  if ((article.contentHtml.match(/<h2\b/gi) ?? []).length < 3) problems.push("нет хотя бы трёх содержательных разделов");
  if (article.metaTitle.length > 70 || article.metaDescription.length > 180) problems.push("метатеги превышают допустимую длину");
  if (/гарант.{0,24}(доход|прибыл|рост|скид)|безрисков|цены.{0,20}(вырастут|всегда растут)|перв.{0,12}(мест|страниц).{0,12}(google|яндекс)/i.test(text)) problems.push("неподтверждённое обещание результата");
  if (/\d[\d\s.,]*\s*%|\d+\s*(?:процент|дней.{0,15}регистрац)|госпошлин|по закону|закон.{0,18}обяз|юридически гарант/i.test(text)) problems.push("финансовое или юридическое утверждение требует отдельной проверки редактором");
  if (/(?:трещин|деформац)[^.!?]{0,130}(?:говорят|означа|доказыва|подтвержда|свидетельств)[^.!?]{0,100}(?:осадк|фундамент|несущ)|плесен[^.!?]{0,100}(?:вызыва|приводит)[^.!?]{0,80}(?:астм|болезн|рак)|документ[^.!?]{0,100}гарантир[^.!?]{0,80}(?:законност|безопасност)/i.test(text)) {
    problems.push("категорический инженерный, медицинский или правовой вывод не подтверждён специалистом");
  }
  for (const phone of text.match(/\+?992[\d\s().-]{9,}/g) ?? []) {
    if (phone.replace(/\D/g, "") !== "992446501414") problems.push("статья содержит неподтверждённый контактный номер");
  }
  const numeric = (value: string) => Number(value.replace(/[\s\u00a0\u202f]/g, "").replace(",", "."));
  for (const match of text.matchAll(/(\d[\d\s\u00a0\u202f]*(?:[,.]\d+)?)\s*(?:сомони|TJS|USD|доллар)/gi)) {
    if (!allowedNumbers.has(numeric(match[1]))) problems.push(`денежная величина не подтверждена каталогом: ${match[1].trim()}`);
  }
  for (const fact of article.keyFacts ?? []) {
    if (!/сомони|TJS|м²|м2|объект|квартир|просмотр|комнат/i.test(`${fact.value} ${fact.label}`)) problems.push("ключевая цифра не относится к измеренным данным каталога");
    const values = fact.value.match(/\d[\d\u00a0\u202f ]*(?:[,.]\d+)?/g) ?? [];
    if (values.some((value) => !allowedNumbers.has(numeric(value)))) problems.push("ключевая цифра отсутствует в исходных данных");
  }
  return [...new Set(problems)];
}
