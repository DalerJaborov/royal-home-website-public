import { Hono } from "hono";
import { localesApp } from './lib/locales-route';
import { randomBytes } from "node:crypto";
import { bodyLimit } from "hono/body-limit";
import { serveStatic } from "@hono/node-server/serve-static";
import type { HttpBindings } from "@hono/node-server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router";
import { createContext } from "./context";
import { env } from "./lib/env";
import { createOAuthCallbackHandler } from "./kimi/auth";
import { Paths } from "@contracts/constants";
import { ensureLocalAdmin } from "./queries/users";
import { crmSyncApp } from "./crm-sync-router";
import { findListingByExternalId } from "./queries/listings";
import { buildSitemapXml } from "./lib/sitemap";
import { getOgImageJpeg, ogImageParamToFilename } from "./lib/ogImage";
import { startBlogAutogenScheduler } from "./blog-generator";
import { warnIfRecaptchaNotConfiguredAtBoot } from "./lib/recaptcha";
import { getInstagramCover } from "./lib/instagram-cover";
import { startLeadDeliveryWorker } from './lib/lead-delivery-worker';
import { createCardImagesApp } from './lib/card-images-route';
import { metaPixelCspSources } from './lib/meta-pixel-html';

const app = new Hono<{ Bindings: HttpBindings }>();

// Meta Pixel hosts are added to the CSP only when META_PIXEL_ID is set.
const metaCsp = metaPixelCspSources(Boolean(env.metaPixelId));

app.use(bodyLimit({ maxSize: 50 * 1024 * 1024 }));

// Security headers on every response. CSP allows Google Fonts (used in
// index.html) and inline styles (Tailwind/framer-motion); everything else
// is same-origin only.
app.use(async (c, next) => {
  await next();
  // Cloudflare JavaScript Detections reads the response CSP and attaches this
  // nonce to its injected script. Each HTML response gets a fresh value.
  const scriptNonce = c.res.headers.get('Content-Type')?.includes('text/html')
    ? ` 'nonce-${randomBytes(18).toString('base64')}'` : '';
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("Permissions-Policy", "camera=(), microphone=(), payment=()");
  // Изолирует window.opener от кросс-origin popup'ов (Kimi OAuth, если
  // когда-нибудь вернётся) — иначе открытая нами вкладка может дотянуться
  // до window.opener и подменить его location (tabnabbing). X-Frame-Options
  // отдельно не нужен: frame-ancestors 'none' в CSP ниже уже запрещает
  // встраивание сайта во фрейм везде, где его слушают браузеры.
  c.header("Cross-Origin-Opener-Policy", "same-origin");
  c.header(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      // mc.yandex.ru / mc.yandex.com — Яндекс.Метрика (public/metrika-loader.js):
      // tag.js, пиксели-бикон и отправка вебвизора идут на эти хосты.
      `script-src 'self'${scriptNonce} https://mc.yandex.ru https://mc.yandex.com https://telegram.org https://static.cloudflareinsights.com https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/${metaCsp.script}`,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      // crm.royalhome.tj: listing photos live on the CRM host; normally they're
      // rewritten to same-origin /uploads/* (api/lib/uploads-url.ts), this is
      // defense-in-depth for any absolute URL that slips through.
      // *.cdninstagram.com/*.fbcdn.net: live Reels cover photos (instagram-router.ts)
      // are served straight from Meta's CDN, not proxied through our own host.
      `img-src 'self' data: blob: https://crm.royalhome.tj https://*.cdninstagram.com https://*.fbcdn.net https://mc.yandex.ru https://mc.yandex.com${metaCsp.img}`,
      // <video> playback for the inline Reels lightbox (ReelsSection.tsx) — the
      // video file itself streams straight from Meta's CDN, same domains as img-src.
      "media-src 'self' https://*.cdninstagram.com https://*.fbcdn.net",
      `connect-src 'self' https://mc.yandex.ru https://mc.yandex.com https://cloudflareinsights.com https://www.google.com/recaptcha/${metaCsp.connect}`,
      // Карты — виджеты Яндекса в iframe (карточка объекта: yandex.com,
      // контакты: yandex.ru). Без frame-src их режет default-src 'self' —
      // именно поэтому «карты не работали».
      "frame-src https://yandex.ru https://*.yandex.ru https://yandex.com https://*.yandex.com https://www.google.com/recaptcha/ https://recaptcha.google.com/recaptcha/",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  );
  if (env.isProduction && c.req.header("x-forwarded-proto") === "https") {
    c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
});
app.get(Paths.oauthCallback, createOAuthCallbackHandler());
app.route('/media/card-v1', createCardImagesApp());
app.route('/media/card-v2', createCardImagesApp(undefined, 'catalog'));
// Dotfiles (например .ig-token.json из старых деплоев) не должны раздаваться —
// serveStatic сам их НЕ блокирует. Любой сегмент пути, начинающийся с точки, → 404.
app.use("/api/uploads/*", async (c, next) => {
  const pathname = decodeURIComponent(new URL(c.req.url).pathname);
  if (pathname.split("/").some((segment) => segment.startsWith("."))) {
    return c.json({ error: "Not Found" }, 404);
  }
  await next();
});
app.use(
  "/api/uploads/*",
  serveStatic({ root: "./", rewriteRequestPath: (path) => path.replace(/^\/api/, "") })
);
app.use("/api/trpc/*", async (c, next) => {
  await next();
  c.header('X-Robots-Tag', 'noindex');
});
app.use("/api/trpc/*", async (c) => {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext,
    // Без этого необработанные ошибки процедур (например, обрыв MySQL-запроса)
    // нигде не логируются на сервере — были видны только клиенту как сырой
    // error.message. Сам ответ клиенту эта опция не меняет, только пишет в лог.
    onError({ error, path }) {
      console.error(`[trpc] ${path ?? "<unknown>"}:`, error);
    },
  });
});
app.route("/api/v1/crm", crmSyncApp);
app.route('/', localesApp);
// JPEG-версия фото объекта для og:image/twitter:image (см. lib/ogImage.ts) —
// WhatsApp массово не показывает превью-картинку, если файл в WebP (родной
// формат фото CRM); конвертируем на лету только для превью, показ на сайте
// как был WebP, так и остаётся. Должен стоять ДО catch-all "/api/*" ниже —
// иначе тот перехватывал бы все запросы сюда первым.
app.get("/api/og-image/:id", async (c) => {
  const filename = ogImageParamToFilename(c.req.param("id"));
  if (!filename) return c.json({ error: "Not Found" }, 404);
  const jpeg = await getOgImageJpeg(filename);
  if (!jpeg) return c.json({ error: "Not Found" }, 404);
  c.header("Cache-Control", "public, max-age=31536000, immutable");
  return c.body(new Uint8Array(jpeg), 200, { "Content-Type": "image/jpeg" });
});
app.get("/api/instagram-cover/:id", async (c) => {
  const cover = await getInstagramCover(c.req.param('id'));
  if (!cover) {
    c.header('Cache-Control', 'no-store');
    return c.json({ error: 'Cover unavailable' }, 404);
  }
  c.header('Cache-Control', 'public, max-age=1200');
  return c.body(new Uint8Array(cover), 200, { 'Content-Type': 'image/webp' });
});
app.all("/api/*", (c) => c.json({ error: "Not Found" }, 404));

// Карта сайта для поисковиков: статика + объекты + статьи блога (cms и articles).
app.get("/sitemap.xml", async (c) => {
  try {
    const xml = await buildSitemapXml();
    c.header("Cache-Control", "public, max-age=3600");
    return c.body(xml, 200, { "Content-Type": "application/xml; charset=utf-8" });
  } catch (e) {
    console.error("[sitemap] Ошибка генерации:", e);
    c.header("Retry-After", "60");
    c.header("Cache-Control", "no-store");
    return c.text("Sitemap unavailable", 503);
  }
});

// Прямая ссылка на объект по CRM-id — её отдаёт чат-бот клиентам. Резолвим листинг
// по externalId (UUID из CRM) и редиректим на его страницу с числовым id сайта.
// Так ссылка работает для ЛЮБОГО опубликованного объекта, не зная id сайта заранее.
app.get("/listing/by-crm/:externalId", async (c) => {
  const externalId = c.req.param("externalId");
  try {
    const listing = await findListingByExternalId(externalId);
    if (listing?.published) return c.redirect(`/listing/${listing.id}`, 302);
  } catch (e) {
    console.error("[listing/by-crm] lookup failed:", e);
  }
  return c.redirect("/listings", 302);
});

export default app;

// A transient DB hiccup at boot shouldn't crash-loop the whole server —
// admin bootstrap will succeed on the next restart, the site still serves.
try {
  await ensureLocalAdmin();
} catch (e) {
  console.error("[auth] Failed to bootstrap admin account (will retry on next restart):", e);
}

warnIfRecaptchaNotConfiguredAtBoot();

// Еженедельная ИИ-генерация статей блога: проверка раз в час «включено ли и прошло
// ли ≥7 дней с последней ИИ-статьи» — переживает рестарты без внешних зависимостей.
// Ошибки внутри планировщика логируются и не роняют сервер.
try {
  startBlogAutogenScheduler();
} catch (e) {
  console.error("[blog-generator] Не удалось запустить планировщик:", e);
}

if (env.isProduction) {
  startLeadDeliveryWorker();
  const { serve } = await import("@hono/node-server");
  const { serveStaticFiles } = await import("./lib/vite");
  serveStaticFiles(app);

  const port = parseInt(process.env.PORT || "3000");
  serve({ fetch: app.fetch, port }, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}
