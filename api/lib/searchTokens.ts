/** Текстовый поиск по каталогу объектов, устойчивый к раскладке/опечаткам.
 *
 * Адаптировано из royal-home-crm (apps/api/src/lib/searchTokens.ts +
 * fuzzySearch.ts) — там подход тот же (разбивка на слова, все слова должны
 * найтись, варианты раскладки/транслита/таджикских букв), но эта БД —
 * MySQL, а не PostgreSQL, и здесь нет pg_trgm. Плюс findAllListings уже
 * фильтрует district/rooms в JS после выборки (см. api/queries/listings.ts),
 * поэтому поиск сделан так же — простым includes() по словам-вариантам,
 * без SQL-условий.
 *
 * НЕ копия 1:1: там generic по произвольной колонке под ILIKE/pg_trgm, здесь —
 * чистая функция над уже загруженной строкой (title + location + description).
 */

const MAX_TOKENS = 8;

/** Разбивает строку поиска на отдельные слова. Разделители — всё, что не буква
 * и не цифра, поэтому «Рудаки, 45» и «Рудаки 45» дают одинаковые слова. */
export function toSearchTokens(query: string): string[] {
  return query
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 0)
    .slice(0, MAX_TOKENS);
}

/** Раскладка клавиатуры: печатать русское слово, забыв переключить язык. */
const LATIN_TO_CYRILLIC_LAYOUT: Record<string, string> = {
  q: "й", w: "ц", e: "у", r: "к", t: "е", y: "н", u: "г", i: "ш", o: "щ", p: "з",
  a: "ф", s: "ы", d: "в", f: "а", g: "п", h: "р", j: "о", k: "л", l: "д",
  z: "я", x: "ч", c: "с", v: "м", b: "и", n: "т", m: "ь",
};

const CYRILLIC_TO_LATIN_LAYOUT: Record<string, string> = Object.fromEntries(
  Object.entries(LATIN_TO_CYRILLIC_LAYOUT).map(([latin, cyrillic]) => [cyrillic, latin])
);

/** Транслитерация: слово пишут латиницей («Rudaki», «Sino»). Диграфы — первыми. */
const TRANSLIT_PAIRS: Array<[string, string]> = [
  ["shch", "щ"], ["sh", "ш"], ["ch", "ч"], ["zh", "ж"], ["kh", "х"], ["ts", "ц"],
  ["yo", "ё"], ["yu", "ю"], ["ya", "я"],
  ["a", "а"], ["b", "б"], ["v", "в"], ["g", "г"], ["d", "д"], ["e", "е"], ["z", "з"],
  ["i", "и"], ["j", "ҷ"], ["y", "й"], ["k", "к"], ["l", "л"], ["m", "м"], ["n", "н"],
  ["o", "о"], ["p", "п"], ["r", "р"], ["s", "с"], ["t", "т"], ["u", "у"], ["f", "ф"],
  ["h", "ҳ"],
];

/** Таджикские буквы с диакритикой к их простым парам. */
const TAJIK_FOLD: Record<string, string> = { "ӯ": "у", "ӣ": "и", "ҳ": "х", "қ": "к", "ҷ": "ч", "ғ": "г" };

function mapChars(value: string, table: Record<string, string>): string {
  return [...value].map((ch) => table[ch] ?? ch).join("");
}

/** Перекладка раскладки — только если ВСЕ буквы слова нашлись в таблице. */
function mapWholeWord(value: string, table: Record<string, string>): string | null {
  let out = "";
  for (const ch of value) {
    if (/\d/.test(ch)) {
      out += ch;
      continue;
    }
    const mapped = table[ch];
    if (!mapped) return null;
    out += mapped;
  }
  return out;
}

function translit(value: string): string {
  let rest = value;
  let out = "";
  outer: while (rest.length > 0) {
    for (const [latin, cyrillic] of TRANSLIT_PAIRS) {
      if (rest.startsWith(latin)) {
        out += cyrillic;
        rest = rest.slice(latin.length);
        continue outer;
      }
    }
    out += rest[0];
    rest = rest.slice(1);
  }
  return out;
}

const hasLatin = (value: string) => /[a-z]/.test(value);
const hasCyrillic = (value: string) => /[Ѐ-ӿ]/.test(value);

const MAX_VARIANTS = 4;

/** Написания одного слова, которые считаются одним и тем же запросом. */
export function toTokenVariants(token: string): string[] {
  const lower = token.toLowerCase();
  if (lower.length < 2 || !/\p{L}/u.test(lower)) return [lower];

  const variants = new Set<string>([lower]);

  if (hasLatin(lower)) {
    const layout = mapWholeWord(lower, LATIN_TO_CYRILLIC_LAYOUT);
    if (layout) variants.add(layout);
    variants.add(translit(lower));
  }
  if (hasCyrillic(lower)) {
    const layout = mapWholeWord(lower, CYRILLIC_TO_LATIN_LAYOUT);
    if (layout) variants.add(layout);
    variants.add(mapChars(lower, TAJIK_FOLD));
  }

  return [...variants].filter((v) => v.length >= 2).slice(0, MAX_VARIANTS);
}

/** Все слова запроса должны найтись (в каком-то из написаний) где-то в
 * searchableText — иначе «Рудаки 45» находило бы любой объект с одним из
 * двух слов. searchableText — уже склеенные и опущенные в lowercase поля
 * листинга (title + location + description), готовые под includes(). */
export function matchesSearch(searchableText: string, query: string): boolean {
  const tokens = toSearchTokens(query);
  if (tokens.length === 0) return true;

  return tokens.every((token) => {
    const variants = toTokenVariants(token);
    return variants.some((variant) => searchableText.includes(variant));
  });
}
