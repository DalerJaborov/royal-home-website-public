/**
 * Написать статью прямо с сервера — тем же кодом, что и кнопка в админке.
 *
 * Нужен, когда до кнопки не добраться (нет входа под рукой) или когда статья
 * пишется дольше, чем живёт HTTP-запрос: Cloudflare рвёт соединение на 100
 * секундах, а статья с двумя нарисованными картинками занимает 2–4 минуты.
 *
 * Запуск на боевом сервере:
 *   docker compose -f docker-compose.prod.yml exec app node dist/write-article.js
 */
import { generateArticle, previewArticleGeneration, previewGeneratedArticle } from "../blog-generator";

async function main() {
  if (process.argv.includes("--preview")) {
    console.log(JSON.stringify(await previewGeneratedArticle(), null, 2));
    process.exit(0);
  }
  if (process.argv.includes("--dry-run")) {
    console.log(JSON.stringify(await previewArticleGeneration(), null, 2));
    process.exit(0);
  }
  console.log("[write-article] Пишу статью…");
  const article = await generateArticle();
  console.log(
    `[write-article] Готово: #${article.id} «${article.title}» (${article.status}), адрес /blog/${article.slug}`
  );
  console.log(`[write-article] Обложка: ${article.coverImageUrl ?? "нет"}, длина текста: ${article.contentHtml.length}`);
  // Пул соединений с БД держит процесс живым — уходим сами.
  process.exit(0);
}

main().catch((e) => {
  console.error("[write-article] Не получилось:", e instanceof Error ? e.message : e);
  process.exit(1);
});
