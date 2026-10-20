/** Текстовый поиск по каталогу объектов — клиентская сторона (см. также
 * api/lib/searchTokens.ts, откуда взят тот же подход и таблицы).
 *
 * Каталог на сайте грузится целиком (useListingsData → list({})) и уже
 * фильтруется по району/комнатам/цене на клиенте (ListingsPage.tsx) —
 * поиск сделан так же, без похода на сервер за каждым нажатием клавиши.
 * Отдельный экземпляр логики, а не общий модуль: src/ и api/ — разные
 * tsconfig/бандлы этого репозитория, общего пакета между ними нет.
 */

const MAX_TOKENS = 8;

export function toSearchTokens(query: string): string[] {
  return query
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 0)
    .slice(0, MAX_TOKENS);
}

const LATIN_TO_CYRILLIC_LAYOUT: Record<string, string> = {
  q: "й", w: "ц", e: "у", r: "к", t: "е", y: "н", u: "г", i: "ш", o: "щ", p: "з",
  a: "ф", s: "ы", d: "в", f: "а", g: "п", h: "р", j: "о", k: "л", l: "д",
  z: "я", x: "ч", c: "с", v: "м", b: "и", n: "т", m: "ь",
};

const CYRILLIC_TO_LATIN_LAYOUT: Record<string, string> = Object.fromEntries(
  Object.entries(LATIN_TO_CYRILLIC_LAYOUT).map(([latin, cyrillic]) => [cyrillic, latin])
);

const TRANSLIT_PAIRS: Array<[string, string]> = [
  ["shch", "щ"], ["sh", "ш"], ["ch", "ч"], ["zh", "ж"], ["kh", "х"], ["ts", "ц"],
  ["yo", "ё"], ["yu", "ю"], ["ya", "я"],
  ["a", "а"], ["b", "б"], ["v", "в"], ["g", "г"], ["d", "д"], ["e", "е"], ["z", "з"],
  ["i", "и"], ["j", "ҷ"], ["y", "й"], ["k", "к"], ["l", "л"], ["m", "м"], ["n", "н"],
  ["o", "о"], ["p", "п"], ["r", "р"], ["s", "с"], ["t", "т"], ["u", "у"], ["f", "ф"],
  ["h", "ҳ"],
];

const TAJIK_FOLD: Record<string, string> = { "ӯ": "у", "ӣ": "и", "ҳ": "х", "қ": "к", "ҷ": "ч", "ғ": "г" };

function mapChars(value: string, table: Record<string, string>): string {
  return [...value].map((ch) => table[ch] ?? ch).join("");
}

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

/** Все слова запроса должны найтись где-то в searchableText (уже lowercase). */
export function matchesSearch(searchableText: string, query: string): boolean {
  const tokens = toSearchTokens(query);
  if (tokens.length === 0) return true;

  return tokens.every((token) => {
    const variants = toTokenVariants(token);
    return variants.some((variant) => searchableText.includes(variant));
  });
}
