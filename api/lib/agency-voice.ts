/**
 * Статья говорит голосом агентства, а не человека.
 *
 * ЗАЧЕМ. Под каждой статьёй стоит подпись «Редакция Royal Home», а первая же
 * статья генератора начиналась словами «Клиенты агентства Royal Home постоянно
 * задают мне один и тот же вопрос… Я работаю на рынке давно». Читатель видит
 * подпись редакции и рассказ от лица какого-то «я» — это выглядит обманом.
 *
 * ПОЧЕМУ НЕ ХВАТАЕТ ПРОМТА. Запрет в промте — просьба, а не гарантия: модель его
 * периодически нарушает, и заметить это может только человек, читающий статью
 * целиком. Поэтому запрет продублирован проверкой в коде: находим первое лицо
 * единственного числа и просим модель переписать ТОЛЬКО эти места.
 *
 * ПОЧЕМУ НЕ АВТОЗАМЕНА СЛОВАРЁМ. «Я работаю» → «Мы работаю»: замена местоимения
 * тянет за собой согласование глаголов, и словарь тут гарантированно врёт.
 * Переписывание отдаём модели, а результат проверяем той же регуляркой.
 */
import { geminiUrl, geminiProxyHeaders } from "./gemini-transport";

/**
 * Местоимения первого лица единственного числа. Границы слова — вручную:
 * `\b` в JS считает буквой только латиницу, поэтому «мне» нашлось бы внутри
 * «мнение», а «моих» — внутри «моихранение».
 */
const FIRST_PERSON_WORDS = [
  "я",
  "мне",
  "меня",
  "мной",
  "мною",
  "мой",
  "моя",
  "моё",
  "мое",
  "мои",
  "моего",
  "моей",
  "моему",
  "моим",
  "моих",
  "моими",
  "моём",
  "моем",
];

const FIRST_PERSON_RE = new RegExp(
  `(?<![А-Яа-яЁё])(${FIRST_PERSON_WORDS.join("|")})(?![А-Яа-яЁё])`,
  "gi"
);

/** Нашлись ли следы «я» в тексте (в HTML-теги не заглядываем — там их не бывает). */
export function findFirstPersonHits(text: string): string[] {
  return [...text.matchAll(FIRST_PERSON_RE)].map((m) => m[0]);
}

const REWRITE_MODELS = ["gemini-flash-latest", "gemini-2.5-flash", "gemini-3.6-flash"] as const;

const REWRITE_INSTRUCTION = [
  "Ты редактор блога агентства недвижимости Royal Home.",
  "Тебе дают текст статьи. Верни ЕГО ЖЕ, исправив ровно одно: первое лицо единственного числа заменить на голос агентства.",
  "«я» → «мы», «мне» → «нам», «мой» → «наш», глаголы согласовать («я работаю» → «мы работаем», «привык» → «привыкли»).",
  "Больше не меняй НИЧЕГО: ни факты, ни цифры, ни заголовки, ни порядок абзацев, ни разметку и теги, ни длину текста.",
  "Ответь только текстом статьи, без пояснений, без markdown-обёрток вроде ```html.",
].join(" ");

/**
 * Переписывает первое лицо на голос агентства.
 * @returns исправленный текст или null, если переписать не удалось или результат
 *          не прошёл проверку (тогда вызывающий оставляет исходный текст).
 */
export async function rewriteToAgencyVoice(apiKey: string, text: string): Promise<string | null> {
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
        throw new Error(`Gemini (голос) вернул ${res.status}: ${body.slice(0, 200)}`);
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
        console.error(`[agency-voice] Переписанный текст отклонён (${model}): ${problem}`);
        continue;
      }
      return cleaned;
    } catch (e) {
      console.error(`[agency-voice] Переписать не удалось (${model}):`, e instanceof Error ? e.message : e);
    }
  }
  return null;
}

/** Модели любят обернуть ответ в ```html … ``` даже когда просили не делать этого. */
function stripCodeFence(text: string): string {
  const fenced = /^```[a-z]*\n([\s\S]*)\n```$/i.exec(text.trim());
  return (fenced ? fenced[1] : text).trim();
}

/**
 * Проверка результата: правка должна быть точечной. Модель, переписавшая статью
 * заново или выбросившая половину текста, опаснее исходного «я» — такой ответ
 * отклоняем и оставляем оригинал.
 */
function checkRewrite(before: string, after: string): string | null {
  if (!after) return "пустой ответ";
  const ratio = after.length / before.length;
  if (ratio < 0.85 || ratio > 1.15) return `длина изменилась в ${ratio.toFixed(2)} раза`;
  const stillFirstPerson = findFirstPersonHits(after);
  if (stillFirstPerson.length) return `первое лицо осталось: ${stillFirstPerson.slice(0, 5).join(", ")}`;
  const tagsBefore = (before.match(/<[a-z][^>]*>/gi) ?? []).length;
  const tagsAfter = (after.match(/<[a-z][^>]*>/gi) ?? []).length;
  if (tagsBefore !== tagsAfter) return `разметка изменилась: было тегов ${tagsBefore}, стало ${tagsAfter}`;
  return null;
}
