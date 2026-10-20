import type { Context, Hono } from "hono";
import type { HttpBindings } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import fs from "fs";
import path from "path";
import { headForPath, injectSeo } from "./prerenderSeo";
import { getCmsEntry, getAllCmsEntries } from "../queries/cms";
import { CMS_BOOTSTRAP_ID, serializeCmsBootstrap, parseCmsBootstrap } from '@contracts/cms-bootstrap';
import { resolvePublicPath } from '@contracts/public-i18n';
import { heroPreloadForPath } from './hero-preload';
import { catalogModulePreloads } from './catalog-module-preloads';
import { localStylesheetPath, prioritizeHeadingFont, prioritizeHomePaint } from './critical-styles';
import { publicAppHtml } from './public-app-render';
import { getPublicDictionary } from './public-translations';
import { injectMetaPixel } from './meta-pixel-html';
import { createHash } from 'node:crypto';
import { env } from './env';

type App = Hono<{ Bindings: HttpBindings }>;

/**
 * Порог инлайна CSS.
 *
 * Инлайн задумывался, когда стилей было ~25 КБ: тогда один сетевой round-trip
 * дороже, чем лишние килобайты в HTML. Но CSS вырос до 83 КБ, а HTML отдаётся
 * с `Cache-Control: no-cache` (ниже) — значит эти килобайты качаются заново на
 * КАЖДОМ переходе по сайту, вместо того чтобы один раз лечь в кэш браузера
 * отдельным файлом с хэшем в имени, который Vite и так делает вечно кэшируемым.
 *
 * 30 КБ — граница, на которой инлайн ещё окупается. Крупный CSS оставляем
 * ссылкой: одна дополнительная загрузка при первом визите против 83 КБ на
 * каждой странице у каждого посетителя.
 */
const INLINE_CSS_LIMIT_BYTES = 30 * 1024;

/** Встраивает небольшие <link rel="stylesheet"> инлайном в <style>, убирая
 * блокирующий CSS-запрос (главный тормоз FCP на мобильном). Крупные стили
 * остаются ссылкой — их выгоднее закэшировать. Делается один раз при старте. */
function inlineStylesheets(html: string, distPath: string, limit = INLINE_CSS_LIMIT_BYTES): string {
  return html.replace(/<link\b[^>]*>/gi, (tag) => {
    if (/\bdata-public-inlined-stylesheet\b/.test(tag)) return tag;
    const stylesheetPath = localStylesheetPath(tag);
    if (!stylesheetPath) return tag;
    try {
      const css = fs.readFileSync(path.resolve(distPath, "." + stylesheetPath), "utf-8");
      if (Buffer.byteLength(css, "utf-8") > limit) {
        console.log(
          `[vite] CSS ${stylesheetPath} — ${Math.round(Buffer.byteLength(css, "utf-8") / 1024)} КБ, ` +
            `больше порога ${INLINE_CSS_LIMIT_BYTES / 1024} КБ: оставляем ссылкой, чтобы браузер его закэшировал`
        );
        return tag;
      }
      // Vite's dynamic-import helper discovers existing styles by link[href].
      // Keep a disabled external marker for generated CSS already inlined here:
      // it causes no fetch, and prevents downloading/reapplying the same CSS
      // during hydration. Other routes/lazy styles retain ordinary links.
      const marker = stylesheetPath.startsWith('/assets/')
        ? `<link rel="stylesheet" href="${stylesheetPath}" disabled data-public-inlined-stylesheet>` : '';
      return `<style data-public-stylesheet="${stylesheetPath}">${css}</style>${marker}`;
    } catch {
      return tag; // файла нет — оставляем ссылку как есть
    }
  });
}

export function serveStaticFiles(app: App) {
  const distPath = path.resolve(import.meta.dirname, "../dist/public");
  // index.html читаем один раз при старте: инлайним CSS, а per-request в него
  // подставляем SEO (см. prerenderSeo) и — на главной — preload hero-картинки.
  const indexTemplate = inlineStylesheets(
    fs.readFileSync(path.resolve(distPath, "index.html"), "utf-8"),
    distPath
  );
  // Complete first-screen HTML benefits from removing the remaining blocking
  // stylesheet round trip. Keep ordinary SPA/fallback pages on cached CSS.
  const renderedTemplate = inlineStylesheets(indexTemplate, distPath, 128 * 1024);
  let metaLoaderVersion = '';
  try { metaLoaderVersion = createHash('sha256').update(fs.readFileSync(path.resolve(distPath, 'meta-pixel-loader.js'))).digest('hex').slice(0, 12); }
  catch { /* No loader in this build: the tag is served unversioned. */ }
  let routeManifest = {};
  try { routeManifest = JSON.parse(fs.readFileSync(path.resolve(distPath, '../route-manifest.json'), 'utf8')); }
  catch { /* Older builds remain functional without optional preload hints. */ }

  /** Отдаёт HTML-шаблон с SEO по пути + preload hero на главной. HTML не кэшируем. */
  async function serveTemplate(c: Context) {
    const head = await headForPath(c.req.url);
    const { basePath, locale } = resolvePublicPath(c.req.path);
    let cmsSource: string | undefined;
    if ((head.status ?? 200) === 200 && !basePath.startsWith('/admin') && basePath !== '/login') {
      try {
        cmsSource = serializeCmsBootstrap(await getAllCmsEntries());
      } catch { /* Optional presentation snapshot; the ordinary API query remains available. */ }
    }
    if (cmsSource && head.catalogInventory && (basePath === '/' || basePath === '/listings') && c.req.url.length <= 4096) {
      const cms = parseCmsBootstrap(cmsSource);
      const dictionary = locale === 'ru' ? undefined : await getPublicDictionary(locale);
      if (cms && (locale === 'ru' || dictionary)) {
        const body = await publicAppHtml({ path: new URL(c.req.url).pathname + new URL(c.req.url).search,
          cms: cms.data, inventory: head.catalogInventory, dictionary: dictionary ?? undefined });
        if (body) { head.body = body; head.hydrate = true; }
      }
    }
    let html = prioritizeHeadingFont(injectSeo(head.hydrate ? renderedTemplate : indexTemplate, head), c.req.path, head.hydrate);
    html = prioritizeHomePaint(html, c.req.path, head.hydrate === true);
    // Meta Pixel: только при заданном META_PIXEL_ID и не на /admin (docs/meta-pixel.md).
    html = injectMetaPixel(html, env.metaPixelId, basePath, metaLoaderVersion);
    if (cmsSource) html = html.replace('</body>', () => `<script type="application/json" id="${CMS_BOOTSTRAP_ID}">${cmsSource}</script>\n</body>`);
    const resources = catalogModulePreloads(c.req.url, routeManifest, html);
    const modulePreloads = head.hydrate ? inlineStylesheets(resources, distPath, 128 * 1024) : resources;
    if (modulePreloads) html = html.replace('</head>', `${modulePreloads}\n</head>`);
    if (resolvePublicPath(c.req.path).basePath === '/') {
      try {
        const preload = heroPreloadForPath(c.req.path, await getCmsEntry('hero'));
        if (preload) html = html.replace('</head>', `    ${preload}\n  </head>`);
      } catch {
        // CMS недоступна — без preload, не критично.
      }
    }
    c.header("Cache-Control", head.status === 503 ? "no-store" : "no-cache");
    if (head.status === 503) c.header("Retry-After", "60");
    return c.html(html, head.status ?? 200);
  }

  // Кэш-заголовки статики (Caddy/Cloudflare их уважают → повторные визиты из кэша).
  app.use("*", async (c, next) => {
    await next();
    if (c.res.status >= 400) {
      c.header('Cache-Control', 'no-store');
      return;
    }
    const p = c.req.path;
    if (p.startsWith("/assets/")) {
      c.header("Cache-Control", "public, max-age=31536000, immutable");
    } else if (p.startsWith("/images/") || p.startsWith("/fonts/") || /\.(webp|png|jpe?g|svg|woff2?|ico|css|js)$/i.test(p)) {
      c.header("Cache-Control", "public, max-age=2592000");
    }
  });

  // Главную отдаём через шаблон (инлайн CSS + SEO + hero preload), а не сырой
  // index.html из serveStatic — иначе на «/» не попадут ни SEO, ни ускорения.
  app.get("/", serveTemplate);

  app.use("*", serveStatic({ root: "./dist/public" }));

  /**
   * Остальные SPA-маршруты (в т.ч. /listing/:id) — тот же шаблон с per-route SEO.
   *
   * Раньше решение принималось по заголовку Accept: HTML получал только тот, кто
   * явно просил text/html. Браузеры так и делают, а curl, валидаторы ссылок и
   * часть поисковых и соцсетевых ботов шлют Accept со звёздочкой (любой тип) —
   * и вместо рабочей страницы получали JSON-ошибку, то есть видели весь сайт
   * несуществующим.
   *
   * Теперь решает путь, а не заголовок. Запрос с расширением — это промах по
   * статике (пропавший чанк, картинка, шрифт), и ему нужен честный 404: отдать
   * HTML вместо отсутствующего .js значит заставить браузер исполнить разметку
   * как скрипт и получить невнятную ошибку вместо понятного 404. Всё остальное —
   * маршрут SPA, даже если клиент не сказал, что ждёт HTML.
   *
   * Настоящие несуществующие страницы при этом остаются 404: код ответа берётся
   * из headForPath (см. prerenderSeo), которая для неизвестного маршрута отдаёт
   * status 404 — но уже с HTML-страницей «Страница не найдена».
   */
  const LOOKS_LIKE_FILE = /\.[a-z0-9]+$/i;

  app.notFound(async (c) => {
    const isPageRequest =
      (c.req.method === "GET" || c.req.method === "HEAD") && !LOOKS_LIKE_FILE.test(c.req.path);
    if (!isPageRequest) {
      return c.json({ error: "Not Found" }, 404);
    }
    return serveTemplate(c);
  });
}
