/**
 * ШТАМПЫ, ПО КОТОРЫМ ЧИТАТЕЛЬ УЗНАЁТ ТЕКСТ ОТ НЕЙРОСЕТИ.
 *
 * Статью пишет модель, и это нормально — ненормально, когда это ВИДНО. Выдают не
 * факты и не длина, а десяток оборотов, которых живой редактор почти не пишет, а
 * модель ставит почти всегда: «в современном мире», «важно отметить», «стоит
 * отметить», «в заключение», «играет важную роль», «не стоит забывать».
 *
 * Человек не думает «это ИИ» — он думает «пресно, как везде» и уходит. Для блога,
 * который держится на поиске и доверии, это прямая потеря: такие же фразы стоят в
 * тысяче чужих статей, и наша перестаёт отличаться.
 *
 * ПОЧЕМУ НЕ ХВАТАЕТ ПРОМТА. Ровно та же причина, что у голоса агентства рядом
 * (lib/agency-voice.ts): запрет в промте — просьба, а не гарантия. Модель держится
 * первые абзацы, а к середине статьи возвращается к привычным оборотам. Поэтому
 * запрет продублирован проверкой в коде: находим штампы и просим переписать ТОЛЬКО
 * эти места.
 *
 * ПОЧЕМУ НЕ АВТОЗАМЕНА СЛОВАРЁМ. «Важно отметить, что цены выросли» без штампа
 * звучит «Цены выросли» — но иногда нужна не отрезка, а перестройка фразы целиком.
 * Словарь тут гарантированно испортит текст, поэтому переписывает модель, а
 * результат проверяется той же регуляркой.
 */
import { geminiUrl, geminiProxyHeaders } from "./gemini-transport";

/**
 * Обороты-маркеры. Список намеренно короткий и злой: сюда попадает только то, что
 * почти никогда не нужно по смыслу и почти всегда выдаёт машину. Слова вроде
 * «например» или «кстати» — обычная живая речь, их здесь нет и быть не должно.
 */
const CLICHE_PATTERNS = [
  "в современном мире",
  "в наше время",
  "в эпоху цифровизации",
  "не секрет,? что",
  "важно отметить",
  "стоит отметить",
  "следует отметить",
  "необходимо отметить",
  "важно понимать",
  "стоит помнить",
  "не стоит забывать",
  "нельзя не отметить",
  "играет важную роль",
  "играет ключевую роль",
  "является неотъемлемой частью",
  "в заключение",
  "подводя итог",
  "таким образом,? можно сделать вывод",
  "надеемся,? (эта )?стать",
  "в данной статье",
  "в этой статье мы рассмотрим",
  "давайте разберёмся",
  "давайте рассмотрим",
  "мир недвижимости",
  "динамично развива",
];

const CLICHE_RE = new RegExp(
  `(?<![А-Яа-яЁё])(${CLICHE_PATTERNS.join("|")})`,
  "gi"
);

/** Какие штампы нашлись в тексте. Пустой список — текст чистый. */
export function findAiCliches(text: string): string[] {
  return [...text.matchAll(CLICHE_RE)].map((m) => m[0].toLowerCase());
}

const REWRITE_MODELS = ["gemini-flash-latest", "gemini-3.7-flash", "gemini-3.6-flash"] as const;

const REWRITE_INSTRUCTION = [
  "Ты редактор блога агентства недвижимости Royal Home в Душанбе.",
  "Тебе дают текст статьи. Верни ЕГО ЖЕ, исправив ровно одно: убрать книжные обороты-штампы,",
  "по которым видно машинный текст. Например: «важно отметить, что цены выросли» → «цены выросли»;",
  "«в современном мире аренда стала популярной» → «аренду сейчас снимают чаще»;",
  "«в заключение скажем» → просто закончи мысль без объявления.",
  "Пиши так, как пишет живой человек, который хорошо знает своё дело: обычными словами, по существу.",
  "Больше не меняй НИЧЕГО: ни факты, ни цифры, ни заголовки, ни порядок абзацев, ни разметку и теги.",
  "Длина должна остаться примерно прежней.",
  "Ответь только текстом статьи, без пояснений, без markdown-обёрток вроде ```html.",
].join(" ");

/**
 * Убирает штампы. Возвращает исправленный текст или null — тогда вызывающий
 * оставляет исходный: статья со штампом всё же лучше, чем испорченная правкой.
 */
export async function rewriteWithoutCliches(apiKey: string, text: string): Promise<string | null> {
  for (const model of REWRITE_MODELS) {
    try {
      const res = await fetch(geminiUrl(`/v1beta/models/${model}:generateContent`), {
        method: "POST",
        signal: AbortSignal.timeout(120_000),
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": apiKey,
          ...geminiProxyHeaders(),
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: REWRITE_INSTRUCTION }] },
          contents: [{ role: "user", parts: [{ text }] }],
          generationConfig: { maxOutputTokens: 32000 },
        }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        if (res.status === 404 || /NOT_FOUND|no longer available/i.test(body)) continue;
        throw new Error(`Gemini (штампы) вернул ${res.status}: ${body.slice(0, 200)}`);
      }

      const data = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const raw = (data.candidates?.[0]?.content?.parts ?? [])
        .map((p) => p.text ?? "")
        .join("")
        .trim();
      const cleaned = stripCodeFence(raw);
      const problem = checkRewrite(text, cleaned);
      if (problem) {
        console.error(`[ai-cliches] Переписанный текст отклонён (${model}): ${problem}`);
        continue;
      }
      return cleaned;
    } catch (e) {
      console.error(`[ai-cliches] Переписать не удалось (${model}):`, e instanceof Error ? e.message : e);
    }
  }
  return null;
}

function stripCodeFence(text: string): string {
  const fenced = /^```[a-z]*\n([\s\S]*)\n```$/i.exec(text.trim());
  return (fenced ? fenced[1] : text).trim();
}

/**
 * Правка должна быть точечной. Модель, переписавшая статью заново, опаснее пары
 * штампов: она теряет факты и ломает вёрстку, а заметить это некому.
 *
 * Остаток штампов не отвергаем: убрать половину — уже лучше, чем ничего, а
 * гоняться за последним оборотом дороже, чем он стоит.
 */
function checkRewrite(before: string, after: string): string | null {
  if (!after) return "пустой ответ";
  const ratio = after.length / before.length;
  if (ratio < 0.85 || ratio > 1.15) return `длина изменилась в ${ratio.toFixed(2)} раза`;
  const tagsBefore = (before.match(/<[a-z][^>]*>/gi) ?? []).length;
  const tagsAfter = (after.match(/<[a-z][^>]*>/gi) ?? []).length;
  if (tagsBefore !== tagsAfter) return `разметка изменилась: было тегов ${tagsBefore}, стало ${tagsAfter}`;
  const left = findAiCliches(after).length;
  const was = findAiCliches(before).length;
  if (left >= was) return `штампов не убавилось (было ${was}, стало ${left})`;
  return null;
}
