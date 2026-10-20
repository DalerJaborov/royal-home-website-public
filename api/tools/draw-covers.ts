/**
 * Разовая прогонка: нарисовать обложки существующим статьям блога.
 *
 * Статьи на сайте живут в ДВУХ местах, и обе нужны:
 *   • cms-ключ `blogPosts` — старые статьи, написанные руками (админка → Блог).
 *     Обложка у них лежит в поле `image`, изначально это статичное фото каталога.
 *   • таблица `articles` — то, что пишет ИИ-генератор (поле `cover_image_url`).
 *
 * Зачем отдельным инструментом, а не кнопкой: каждая картинка рисуется 10-20
 * секунд, и десяток статей одним HTTP-запросом не пройдёт — Cloudflare рвёт
 * соединение на 100 секундах. Кнопка в админке перерисовывает ОДНУ статью,
 * массовый прогон — здесь.
 *
 * Запуск на боевом сервере (переменные окружения уже в контейнере):
 *   docker compose -f docker-compose.prod.yml exec app node dist/draw-covers.js
 *
 * Ключи:
 *   --only-missing   только тем, у кого обложки нет вовсе
 *   --posts          только старые статьи из cms (blogPosts)
 *   --articles       только статьи ИИ-генератора (таблица articles)
 *   --limit=N        не больше N статей за прогон
 *   --dry-run        показать план, ничего не рисовать и не менять
 *
 * Сцену для каждой картинки придумывает модель, прочитав статью: описывать
 * картинку словами человек не должен.
 */
import { findAllArticles, updateArticle } from "../queries/articles";
import { getCmsEntry, setCmsEntry } from "../queries/cms";
import { getGeminiApiKey } from "../blog-generator";
import { describeArticleScene, generateCoverImage } from "../lib/blog-cover";
import { isGeminiProxyConfigured } from "../lib/gemini-transport";
import { excludesAutomaticTopic } from "../lib/blog-editorial-policy";

const args = process.argv.slice(2);
const has = (flag: string) => args.includes(flag);
const limitArg = args.find((a) => a.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : Infinity;
const onlyMissing = has("--only-missing");
const dryRun = has("--dry-run");
const doPosts = has("--posts") || !has("--articles");
const doArticles = has("--articles") || !has("--posts");

/** Пауза между картинками: image-модели ограничены запросами в минуту. */
const PAUSE_MS = 4000;

/** Старая статья из cms-ключа blogPosts (тип-зеркало BlogPostItem во фронтенде). */
interface CmsBlogPost {
  id: number;
  title: string;
  excerpt?: string;
  image?: string;
  content?: string;
  active?: boolean;
}

interface Failure {
  what: string;
  error: string;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const failures: Failure[] = [];
let drawn = 0;
let budget = limit;
let geminiKey = "";

/**
 * Одна картинка в два шага: сначала модель читает статью и придумывает кадр,
 * потом художник его рисует. Шаги разведены нарочно — так прогон видит уже
 * занятые сцены и просит следующую заметно другую, иначе шесть статей подряд
 * получают одну и ту же панораму «улица и горы».
 */
const usedScenes: string[] = [];

async function draw(what: string, subject: { title: string; excerpt?: string | null; contentHtml?: string | null }) {
  const scene = await describeArticleScene(geminiKey, { ...subject, avoidScenes: usedScenes });
  if (scene) usedScenes.push(scene);
  const url = await generateCoverImage(geminiKey, { ...subject, imagePrompt: scene });
  drawn++;
  console.log(`[draw-covers] ${what}\n    кадр: ${scene ?? "(придуман по заголовку)"}\n    → ${url}`);
  return url;
}

async function main() {
  if (!isGeminiProxyConfigured()) {
    console.warn("[draw-covers] ВНИМАНИЕ: прокси Gemini не настроен — из нашего региона Google откажет.");
  }
  const key = await getGeminiApiKey();
  if (!key) {
    console.error("[draw-covers] Не задан ключ Gemini (админка → Блог → Ключ Gemini API). Рисовать нечем.");
    process.exit(1);
  }
  geminiKey = key;

  if (doPosts) await handleCmsPosts();
  if (doArticles) await handleArticles();

  console.log(`\n[draw-covers] Готово: нарисовано ${drawn}, ошибок ${failures.length}`);
  for (const f of failures) console.log(`  ${f.what}: ${f.error}`);
  // Пул соединений с БД держит процесс живым — уходим сами, иначе прогон
  // висит до таймаута и выглядит зависшим, хотя всё уже сделано.
  process.exit(failures.length ? 1 : 0);
}

/** Старые статьи из cms: обложка лежит в поле image самого элемента массива. */
async function handleCmsPosts() {
  const raw = await getCmsEntry("blogPosts");
  if (!Array.isArray(raw)) {
    console.log("[draw-covers] В cms нет ключа blogPosts — старых статей нет, пропускаю.");
    return;
  }
  const posts = raw as CmsBlogPost[];
  const targets = posts.filter((p) => !excludesAutomaticTopic(`${p.title} ${p.excerpt ?? ""} ${p.content ?? ""}`) && (onlyMissing ? !p.image : true)).slice(0, budget);
  console.log(`[draw-covers] Старых статей (cms): ${posts.length}, к работе: ${targets.length}`);

  for (const [i, post] of targets.entries()) {
    const what = `cms #${post.id} «${post.title}»`;
    if (dryRun) {
      console.log(`  ${what} (обложка сейчас: ${post.image || "нет"})`);
      continue;
    }
    try {
      post.image = await draw(what, { title: post.title, excerpt: post.excerpt, contentHtml: post.content });
      // Пишем после каждой статьи: обрыв посреди прогона не должен терять уже
      // нарисованное — картинка оплачена, а ссылка на неё осталась бы в памяти.
      await setCmsEntry("blogPosts", posts);
    } catch (e) {
      failures.push({ what, error: e instanceof Error ? e.message : String(e) });
      console.error(`[draw-covers] ${what} — ОШИБКА: ${failures.at(-1)!.error}`);
    }
    budget--;
    if (i < targets.length - 1) await sleep(PAUSE_MS);
  }
}

/** Статьи ИИ-генератора: обложка в поле cover_image_url таблицы articles. */
async function handleArticles() {
  if (budget <= 0) return;
  const all = await findAllArticles();
  const targets = all.filter((a) => !excludesAutomaticTopic(`${a.title} ${a.category} ${a.excerpt ?? ""} ${a.contentHtml}`) && (onlyMissing ? !a.coverImageUrl : true)).slice(0, budget);
  console.log(`[draw-covers] Статей ИИ-генератора: ${all.length}, к работе: ${targets.length}`);

  for (const [i, article] of targets.entries()) {
    const what = `статья #${article.id} «${article.title}»`;
    if (dryRun) {
      console.log(`  ${what} (обложка сейчас: ${article.coverImageUrl || "нет"})`);
      continue;
    }
    try {
      const coverImageUrl = await draw(what, {
        title: article.title,
        excerpt: article.excerpt,
        contentHtml: article.contentHtml,
      });
      await updateArticle(article.id, { coverImageUrl });
    } catch (e) {
      failures.push({ what, error: e instanceof Error ? e.message : String(e) });
      console.error(`[draw-covers] ${what} — ОШИБКА: ${failures.at(-1)!.error}`);
    }
    budget--;
    if (i < targets.length - 1) await sleep(PAUSE_MS);
  }
}

main().catch((e) => {
  console.error("[draw-covers] Прогон сорвался:", e);
  process.exit(1);
});
