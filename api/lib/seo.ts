/**
 * Детерминированный генератор SEO-полей объявления — без ИИ, всегда доступен.
 * Служит двум целям:
 *  1) страховка на бэкенде: гарантирует, что у КАЖДОГО объявления (в т.ч.
 *     синхронизированного из CRM или импортированного) заполнены meta-поля,
 *     даже если админ не нажимал «Сгенерировать SEO»;
 *  2) fallback для ИИ-роутера, когда ANTHROPIC_API_KEY не задан или API упал.
 *
 * Правила подобраны под рынок Душанбе: ключевой запрос «купить квартиру в
 * Душанбе» + район + комнатность вынесены в начало title/description.
 */

const ruNum = (n: number) => n.toLocaleString("ru-RU");

/** Обрезает строку до max символов по границе слова, добавляя … */
function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd() + "…";
}

/** Категория объекта (см. CRM Property.type) — определяет, каким словом
 * называть объект в SEO-текстах. Раньше все объявления, включая дома, участки
 * и коммерцию, назывались «квартирой» — этот параметр раньше нигде не
 * учитывался, поэтому title/description/h1 были одинаково «Купить N-комнатную
 * квартиру» даже для коммерческого помещения (см. buildListingSeoMeta ниже). */
export type ListingCategory = "APARTMENT" | "HOUSE" | "COMMERCIAL" | "LAND";

export interface ListingSeoInput {
  title: string;
  location: string;
  price: number;
  rooms: number;
  area: number;
  /** Новостройка/вторичка — самостоятельная ось, не путать с category. */
  type?: string;
  category?: ListingCategory;
  district?: string;
  floor?: string;
}

export interface ListingSeoMeta {
  /** ≤60 символов, ключевик в начале — для <title> и og:title. */
  metaTitle: string;
  /** ≤160 символов — для <meta name="description"> и og:description. */
  metaDescription: string;
  /** Заголовок H1 страницы объекта. */
  h1: string;
}

/** Именительный/винительный падеж названия объекта по категории. rooms
 * учитывается только там, где это естественно (квартира/дом) — участок и
 * коммерческое помещение по-русски не описывают через «N-комнатный». */
function nounPhrase(category: ListingCategory | undefined, rooms: number, accusative = false): string {
  switch (category) {
    case "HOUSE":
      return `${rooms}-комнатный дом`; // муж. род, неодуш. — вин. падеж совпадает с им.
    case "COMMERCIAL":
      return "коммерческое помещение"; // ср. род, неодуш. — вин. падеж совпадает с им.
    case "LAND":
      return "земельный участок"; // муж. род, неодуш. — вин. падеж совпадает с им.
    case "APARTMENT":
    default:
      if (rooms <= 1) return accusative ? "1-комнатную квартиру" : "1-комнатная квартира";
      return accusative ? `${rooms}-комнатную квартиру` : `${rooms}-комнатная квартира`;
  }
}

/** Собирает SEO-мета детерминированно из полей объявления. */
export function buildListingSeoMeta(i: ListingSeoInput): ListingSeoMeta {
  const districtPart = i.district ? `, ${i.district}` : "";
  const typeWord = i.type === "Вторичка" ? "вторичка" : i.type === "Новостройки" ? "новостройка" : "";
  // «Новостройка/вторичка» осмысленно только для жилья — для участка и
  // коммерческого помещения эта ось просто не применяется.
  const marketTypePart = !typeWord || i.category === "COMMERCIAL" || i.category === "LAND" || i.category === "HOUSE" ? "" : `, ${typeWord}`;

  const metaTitle = clip(`Купить ${nounPhrase(i.category, i.rooms, true)} ${i.area} м² в Душанбе${districtPart}`, 60);

  const h1 = `${nounPhrase(i.category, i.rooms)} ${i.area} м² в Душанбе${districtPart}`;

  const metaDescription = clip(
    `${nounPhrase(i.category, i.rooms)} ${i.area} м²${districtPart} в Душанбе${marketTypePart}. Цена ${ruNum(
      i.price
    )} сомони. Проверенный объект от агентства ROYAL HOME — звоните, организуем показ!`,
    160
  );

  return { metaTitle, metaDescription, h1 };
}

/** Заполняет пустые SEO-поля объявления детерминированной страховкой. Уже
 * заданные значения (ручные или сгенерированные ИИ) не трогает. */
export function withListingSeoDefaults<
  T extends {
    metaTitle?: string | null;
    metaDescription?: string | null;
    h1?: string | null;
    seoDesc?: string | null;
  }
>(data: T, input: ListingSeoInput): T {
  const seo = buildListingSeoMeta(input);
  return {
    ...data,
    metaTitle: data.metaTitle?.trim() || seo.metaTitle,
    metaDescription: data.metaDescription?.trim() || seo.metaDescription,
    h1: data.h1?.trim() || seo.h1,
    seoDesc: data.seoDesc?.trim() || seo.metaDescription,
  };
}

type StoredListingSeo = {
  title: string; location: string; price: number; rooms: number; area: number;
  type?: string | null; category?: ListingCategory;
  details?: Record<string, string> | null;
  metaTitle?: string | null; metaDescription?: string | null;
  h1?: string | null; seoDesc?: string | null;
};

/** Refresh only exact deterministic templates. A changed word makes a field
 * editorial and preserves it. Read-time repair also covers old rows and facts-only
 * syncs without writing to the database or changing their protected fields. */
export function refreshGeneratedListingSeo<T extends StoredListingSeo>(row: T, previous?: StoredListingSeo): T {
  const input = (source: StoredListingSeo, district = source.location.split(',')[0]?.trim()): ListingSeoInput => ({
    title: source.title, location: source.location, price: source.price,
    rooms: source.rooms, area: source.area, type: source.type ?? undefined,
    category: source.category, district,
  });
  const current = buildListingSeoMeta(input(row));
  const result = { ...row };
  for (const field of ['metaTitle', 'metaDescription', 'h1', 'seoDesc'] as const) {
    const stored = row[field];
    if (!stored || stored.length > 300) continue;
    const key = field === 'seoDesc' ? 'metaDescription' : field;
    if (stored === current[key]) continue;
    const printedPrice = /\. Цена ([\d\s\u00a0\u202f]+) сомони\./u.exec(stored)?.[1];
    const oldPrice = printedPrice ? Number(printedPrice.replace(/\s/gu, '')) : undefined;
    let generated = false;
    candidateSources: for (const source of previous ? [previous, row] : [row]) {
      for (const district of new Set([source.location.split(',')[0]?.trim(), source.details?.district])) {
        for (const type of [source.type ?? undefined, 'Новостройки', 'Вторичка', undefined]) {
          const candidate = { ...input(source, district), type };
          if (buildListingSeoMeta(candidate)[key] === stored ||
            (oldPrice !== undefined && Number.isSafeInteger(oldPrice) && oldPrice >= 0 &&
              buildListingSeoMeta({ ...candidate, price: oldPrice })[key] === stored)) {
            generated = true;
            break candidateSources;
          }
        }
      }
    }
    if (generated) result[field] = current[key];
  }
  return result;
}

// ─── ТАДЖИКСКАЯ ВЕРСИЯ (кириллица тоҷикӣ) ───
// Тот же принцип: каждое объявление получает таджикские SEO-поля автоматически
// при создании, без участия админа и без ИИ — деш��вая и надёжная страховка,
// которая сразу даёт сайту двуязычный (RU+TJ) контент на одном URL.

const tjNum = (n: number) => n.toLocaleString("ru-RU"); // группировка разрядов та же, слово «сомонӣ» отдельно

export interface ListingSeoMetaTj {
  metaTitleTj: string;
  metaDescriptionTj: string;
  h1Tj: string;
  descriptionTj: string;
}

/** Название объекта на таджикском по категории. Таджикский язык падежи
 * существительных не изменяет, поэтому единая форма для им./вин. падежа. */
function nounPhraseTj(category: ListingCategory | undefined, rooms: number): string {
  switch (category) {
    case "HOUSE":
      return `хонаи ${rooms}-хонагӣ`;
    case "COMMERCIAL":
      return "биноии тиҷоратӣ";
    case "LAND":
      return "қитъаи замин";
    case "APARTMENT":
    default:
      return rooms <= 1 ? "квартираи 1-хонагӣ" : `квартираи ${rooms}-хонагӣ`;
  }
}

/** Собирает таджикские SEO-мета + продающее описание детерминированно —
 * зеркало buildListingSeoMeta, вызывается той же страховкой в queries/listings.ts. */
export function buildListingSeoMetaTj(i: ListingSeoInput): ListingSeoMetaTj {
  const districtPart = i.district ? `, ноҳияи ${i.district}` : "";
  const typeWordTj = i.type === "Вторичка" ? "хонаи истифодашуда" : i.type === "Новостройки" ? "бинои навсохт" : "";
  const marketTypePart = !typeWordTj || i.category === "COMMERCIAL" || i.category === "LAND" || i.category === "HOUSE" ? "" : `, ${typeWordTj}`;
  const floorPart = i.floor ? `, ошёнаи ${i.floor}` : "";

  const metaTitleTj = clip(
    `Харидани ${nounPhraseTj(i.category, i.rooms)} ${i.area} м² дар Душанбе${districtPart}`,
    60
  );

  const h1Tj = `${nounPhraseTj(i.category, i.rooms)}, ${i.area} м² дар Душанбе${districtPart}`;

  const metaDescriptionTj = clip(
    `${nounPhraseTj(i.category, i.rooms)}, ${i.area} м²${districtPart} дар Душанбе${marketTypePart}. Нарх ${tjNum(
      i.price
    )} сомонӣ. Объекти тафтишшуда аз агентии ROYAL HOME — занг занед, намоишро ташкил мекунем!`,
    160
  );

  const openersTj = [
    `Фурӯши ${nounPhraseTj(i.category, i.rooms)} бо масоҳати ${i.area} м²${districtPart} дар шаҳри Душанбе${floorPart}.`,
    `Дар фурӯш — ${nounPhraseTj(i.category, i.rooms)}, ${i.area} м²${districtPart}, шаҳри Душанбе${floorPart}.`,
  ];
  const opener = openersTj[i.rooms % openersTj.length];

  const middleTj = 'Шароити боздид ва ҷузъиёти объектро бо агент дақиқ кунед.';

  const closerTj = `Агентии ROYAL HOME муомиларо аз аввал то анҷом ҳамроҳӣ мекунад: санҷиши ҳуҷҷатҳо, шартнома, ҳисоби бехатар. Занг занед — намоишро дар вақти муносиб ташкил мекунем.`;

  const descriptionTj = `${opener} ${middleTj}\n\n${closerTj}`;

  return { metaTitleTj, metaDescriptionTj, h1Tj, descriptionTj };
}

/** Заполняет пустые таджикские SEO-поля объявления — зеркало
 * withListingSeoDefaults, но никогда не трогает уже заданные значения
 * (например, если однажды появится ручной/ИИ-перевод). */
export function withListingSeoDefaultsTj<
  T extends {
    metaTitleTj?: string | null;
    metaDescriptionTj?: string | null;
    h1Tj?: string | null;
    descriptionTj?: string | null;
  }
>(data: T, input: ListingSeoInput): T {
  const seo = buildListingSeoMetaTj(input);
  return {
    ...data,
    metaTitleTj: data.metaTitleTj?.trim() || seo.metaTitleTj,
    metaDescriptionTj: data.metaDescriptionTj?.trim() || seo.metaDescriptionTj,
    h1Tj: data.h1Tj?.trim() || seo.h1Tj,
    descriptionTj: data.descriptionTj?.trim() || seo.descriptionTj,
  };
}
