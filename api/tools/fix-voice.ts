/**
 * Разовая прогонка: убрать «я» из уже вышедших статей.
 *
 * Первая статья генератора начиналась словами «…задают мне один и тот же вопрос.
 * Я работаю на рынке Душанбе давно» — при подписи «Редакция Royal Home». Новые
 * статьи чинит сам генератор (см. enforceAgencyVoice), а эта прогонка нужна для
 * уже опубликованных.
 *
 * Запуск на боевом сервере:
 *   docker compose -f docker-compose.prod.yml exec app node dist/fix-voice.js --dry-run
 *   docker compose -f docker-compose.prod.yml exec app node dist/fix-voice.js
 *
 * Ключи:
 *   --dry-run   только показать, где нашлось первое лицо
 *   --posts     только старые статьи из cms
 *   --articles  только статьи генератора
 */
import { findAllArticles, updateArticle } from "../queries/articles";
import { getCmsEntry, setCmsEntry } from "../queries/cms";
import { getGeminiApiKey } from "../blog-generator";
import { findFirstPersonHits, rewriteToAgencyVoice } from "../lib/agency-voice";
import { excludesAutomaticTopic } from "../lib/blog-editorial-policy";

const args = process.argv.slice(2);
const has = (flag: string) => args.includes(flag);
const dryRun = has("--dry-run");
const doPosts = has("--posts") || !has("--articles");
const doArticles = has("--articles") || !has("--posts");

interface CmsBlogPost {
  id: number;
  title: string;
  excerpt?: string;
  content?: string;
}

let fixed = 0;
let geminiKey = "";
const failures: string[] = [];

/** Показать найденное место с окрестностями — чтобы решение было видно глазами. */
function context(text: string, hit: string): string {
  const i = text.toLowerCase().indexOf(hit.toLowerCase());
  return i < 0 ? hit : text.slice(Math.max(0, i - 60), i + 60).replace(/\s+/g, " ").trim();
}

async function fixField(what: string, text: string | null | undefined): Promise<string | null> {
  if (!text) return null;
  const hits = findFirstPersonHits(text);
  if (!hits.length) return null;

  if (dryRun) {
    console.log(`  ${what}: ${hits.length} шт. — ${hits.slice(0, 6).join(", ")}`);
    console.log(`     …${context(text, hits[0])}…`);
    return null;
  }

  const rewritten = await rewriteToAgencyVoice(geminiKey, text);
  if (!rewritten) {
    failures.push(`${what}: переписать не удалось`);
    return null;
  }
  fixed++;
  console.log(`  ${what}: исправлено (${hits.length} шт.)`);
  return rewritten;
}

async function main() {
  const key = await getGeminiApiKey();
  if (!key && !dryRun) {
    console.error("[fix-voice] Не задан ключ Gemini — переписывать нечем.");
    process.exit(1);
  }
  geminiKey = key ?? "";

  if (doPosts) {
    const raw = await getCmsEntry("blogPosts");
    const posts = Array.isArray(raw) ? (raw as CmsBlogPost[]) : [];
    console.log(`[fix-voice] Старых статей (cms): ${posts.length}`);
    for (const post of posts) {
      if (excludesAutomaticTopic(`${post.title} ${post.excerpt ?? ""} ${post.content ?? ""}`)) continue;
      console.log(`cms #${post.id} «${post.title}»`);
      const content = await fixField("текст", post.content);
      const excerpt = await fixField("описание", post.excerpt);
      if (content) post.content = content;
      if (excerpt) post.excerpt = excerpt;
      if (content || excerpt) await setCmsEntry("blogPosts", posts);
    }
  }

  if (doArticles) {
    const articles = await findAllArticles();
    console.log(`[fix-voice] Статей генератора: ${articles.length}`);
    for (const article of articles) {
      if (excludesAutomaticTopic(`${article.title} ${article.category} ${article.excerpt ?? ""} ${article.contentHtml}`)) continue;
      console.log(`статья #${article.id} «${article.title}»`);
      const contentHtml = await fixField("текст", article.contentHtml);
      const excerpt = await fixField("описание", article.excerpt);
      if (contentHtml || excerpt) {
        await updateArticle(article.id, {
          ...(contentHtml ? { contentHtml } : {}),
          ...(excerpt ? { excerpt } : {}),
        });
      }
    }
  }

  console.log(`\n[fix-voice] Готово: исправлено полей ${fixed}, не удалось ${failures.length}`);
  for (const f of failures) console.log(`  ${f}`);
  // Пул соединений с БД держит процесс живым — уходим сами.
  process.exit(failures.length ? 1 : 0);
}

main().catch((e) => {
  console.error("[fix-voice] Прогон сорвался:", e);
  process.exit(1);
});
