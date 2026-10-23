import {
  index,
  mysqlTable,
  mysqlEnum,
  serial,
  varchar,
  text,
  longtext,
  timestamp,
  int,
  bigint,
  json,
  boolean,
  decimal,
} from "drizzle-orm/mysql-core";

// ─── USERS (auth) ───
export const users = mysqlTable("users", {
  id: serial("id").primaryKey(),
  unionId: varchar("unionId", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 320 }),
  // Set only for the local admin account (api/local-auth.ts) — Kimi-OAuth
  // users never have one and log in via the OAuth flow instead.
  passwordHash: varchar("passwordHash", { length: 255 }),
  avatar: text("avatar"),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  // TOTP two-factor auth (Google Authenticator etc.) — see api/lib/totp.ts.
  // totpSecret is set as soon as setup starts but totpEnabled stays false
  // (login doesn't require a code yet) until the user confirms one code.
  totpSecret: varchar("totpSecret", { length: 255 }),
  totpEnabled: boolean("totpEnabled").default(false).notNull(),
  // С2/security-audit-11-09.md: отзыв сессий без общей таблицы токенов.
  // Каждый выданный JWT несёт то значение sessionVersion, что было у
  // пользователя в момент выдачи; logout и сброс пароля инкрементируют это
  // поле в БД — все ранее выданные токены (с меньшим значением) перестают
  // проходить проверку в api/kimi/auth.ts, даже если их срок ещё не истёк.
  sessionVersion: int("sessionVersion").default(0).notNull(),
  // С3/security-audit-11-09.md: одноразовая ссылка смены пароля вместо
  // пароля открытым текстом в ответе admin-reset (api/crm-sync-router.ts).
  // В БД хранится ХЭШ токена (не сам токен — как с паролем), срок жизни 15
  // минут. passwordResetClearsTotp запоминает resetTotp из исходного
  // запроса CRM, чтобы применить его в момент, когда ссылкой действительно
  // воспользуются, а не раньше.
  passwordResetTokenHash: varchar("passwordResetTokenHash", { length: 64 }),
  passwordResetExpiresAt: timestamp("passwordResetExpiresAt"),
  passwordResetClearsTotp: boolean("passwordResetClearsTotp").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
  lastSignInAt: timestamp("lastSignInAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── LISTINGS (объекты недвижимости) ───
export const listings = mysqlTable("listings", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 500 }).notNull(),
  location: varchar("location", { length: 500 }).notNull(),
  price: int("price").notNull(),
  rooms: int("rooms").notNull(),
  area: int("area").notNull(),
  floor: varchar("floor", { length: 100 }),
  totalFloors: int("total_floors"),
  type: mysqlEnum("type", ["Новостройки", "Вторичка"]),
  stage: varchar("stage", { length: 255 }),
  repair: varchar("repair", { length: 255 }),
  urgent: boolean("urgent").default(false).notNull(),
  sold: boolean("sold").default(false).notNull(),
  // Publish control for CRM-driven sync (see ops/CRM_SYNC_PLAN.md). Defaults
  // true so the migration doesn't hide listings that already exist on the
  // live site — only listings the CRM explicitly unpublishes disappear.
  published: boolean("published").default(true).notNull(),
  category: mysqlEnum("category", ["APARTMENT", "HOUSE", "COMMERCIAL", "LAND"])
    .default("APARTMENT")
    .notNull(),
  // Id of the source Property in the CRM (D:\CRM) — set only for
  // CRM-synced listings, used to upsert on repeat sync calls.
  externalId: varchar("external_id", { length: 100 }).unique(),
  // Номер карточки объекта в CRM (Property.shortId) — ЕДИНСТВЕННЫЙ номер, который
  // сайт показывает посетителю («объект №N», заголовок, сообщение в WhatsApp) и
  // который бот CRM читает как «объект №N». Он же content_id каталога Meta
  // (contracts/meta-content-id.ts). NULL = CRM номер ещё не прислала: тогда сайт
  // не печатает номер вовсе. Приходит в payload синка (api/crm-sync-router.ts).
  crmShortId: int("crm_short_id").unique(),
  images: int("images").default(5).notNull(),
  imageUrls: json("image_urls").$type<string[]>(),
  description: text("description"),
  seoDesc: text("seo_desc"),
  // Flat details block (balcony, bathroom, ceilingHeight, windows, heating,
  // elevator, parking, security, yearBuilt, material, internet, furniture,
  // appliances, district) — free-form so admin form fields can evolve.
  details: json("details").$type<Record<string, string>>(),
  mapAddress: varchar("map_address", { length: 500 }),
  // Real geocoded coordinates from the CRM (apps/api/src/lib/siteSync.ts).
  // Nullable — coverage is patchy (free Nominatim geocoder), so the map
  // falls back to the district-approximation in src/data/listings.ts when
  // either is missing. Never hand-typed on the site — CRM is the source of truth.
  lat: decimal("lat", { precision: 10, scale: 7, mode: "number" }),
  lng: decimal("lng", { precision: 11, scale: 7, mode: "number" }),
  // Link to an Instagram Reel/post with a video tour of the property.
  instagramUrl: varchar("instagram_url", { length: 500 }),
  // Готовый ролик объекта (mp4 с хоста CRM) — вторым слайдом галереи страницы объекта.
  // Приходит в payload синка (api/crm-sync-router.ts); NULL = у объекта нет публичного ролика.
  videoUrl: varchar("video_url", { length: 500 }),
  metaTitle: varchar("meta_title", { length: 255 }),
  metaDescription: text("meta_description"),
  h1: varchar("h1", { length: 255 }),
  // Таджикская версия SEO-полей (кириллица тоҷикӣ) — заполняется автоматически
  // при создании объявления (см. withListingSeoDefaultsTj в api/lib/seo.ts).
  descriptionTj: text("description_tj"),
  metaTitleTj: varchar("meta_title_tj", { length: 255 }),
  metaDescriptionTj: text("meta_description_tj"),
  h1Tj: varchar("h1_tj", { length: 255 }),
  date: varchar("date", { length: 50 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
});

export type Listing = typeof listings.$inferSelect;
export type InsertListing = typeof listings.$inferInsert;

// ─── FAVORITES (связь пользователь-объект) ───
export const favorites = mysqlTable("favorites", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
  listingId: bigint("listing_id", { mode: "number", unsigned: true }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Favorite = typeof favorites.$inferSelect;
export type InsertFavorite = typeof favorites.$inferInsert;

// ─── CMS ENTRIES (контент сайта из админки: hero, баннеры, услуги, блог, настройки) ───
export const cmsEntries = mysqlTable("cms_entries", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 100 }).notNull().unique(),
  value: json("value").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
});

export type CmsEntry = typeof cmsEntries.$inferSelect;
export type InsertCmsEntry = typeof cmsEntries.$inferInsert;

// ─── LEADS (заявки с форм сайта) ───
export const leads = mysqlTable("leads", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }),
  phone: varchar("phone", { length: 50 }).notNull(),
  message: text("message"),
  source: varchar("source", { length: 100 }).notNull(), // e.g. "contacts", "sell", "dushanbe-banner"
  status: mysqlEnum("status", ["new", "contacted", "closed"]).default("new").notNull(),
  // CRM Client.id this lead was forwarded to (api/lib/crm.ts) — null if the
  // CRM integration was off or the forward failed. Lets status changes sync
  // both ways between the site's lead list and the CRM (api/crm-sync-router.ts).
  crmClientId: varchar("crm_client_id", { length: 36 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Lead = typeof leads.$inferSelect;
export type InsertLead = typeof leads.$inferInsert;

// Transactional outbox: only newly accepted leads enter this queue. Immutable
// wire payload preserves the CRM's content-based delivery deduplication key.
export const leadDeliveries = mysqlTable("lead_deliveries", {
  leadId: bigint("lead_id", { mode: "number", unsigned: true }).primaryKey(),
  payload: json("payload").$type<{ fullName: string; phone: string; comment: string; pageUrl?: string }>().notNull(),
  state: mysqlEnum("state", ["pending", "delivered", "blocked"]).default("pending").notNull(),
  attempts: int("attempts").default(0).notNull(),
  nextAttemptAt: timestamp("next_attempt_at").defaultNow().notNull(),
  leaseToken: varchar("lease_token", { length: 36 }),
  leaseUntil: timestamp("lease_until"),
  lastError: varchar("last_error", { length: 40 }),
  deliveredAt: timestamp("delivered_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("lead_deliveries_due_idx").on(t.state, t.nextAttemptAt)]);

// ─── ARTICLES (блог: ИИ-генератор статей + ручные статьи) ───
// Отдельная таблица (а не cms-ключ blogPosts): статьи генерируются автоматически
// по расписанию, нужны slug-URL для SEO, статусы черновик/опубликовано и индексы.
// Старые статьи из cms.blogPosts продолжают работать по числовым URL /blog/:id.
export const articles = mysqlTable(
  "articles",
  {
    id: serial("id").primaryKey(),
    slug: varchar("slug", { length: 255 }).notNull().unique(),
    title: varchar("title", { length: 500 }).notNull(),
    excerpt: text("excerpt"),
    // LONGTEXT — чтобы длинные статьи с HTML-разметкой никогда не упирались в лимит TEXT.
    contentHtml: longtext("content_html").notNull(),
    metaTitle: varchar("meta_title", { length: 255 }),
    metaDescription: text("meta_description"),
    coverImageUrl: varchar("cover_image_url", { length: 500 }),
    // Рубрика блога («Ипотека», «Юридические вопросы»…): статьи генератора больше
    // не все «Аналитика», иначе фильтр на /blog для них не работает. Nullable —
    // у статей, написанных до 15.08.2026, рубрики нет.
    category: varchar("category", { length: 60 }),
    // FAQ отдельным полем — нужен для JSON-LD FAQPage (из HTML его не выковырять надёжно).
    faq: json("faq").$type<{ q: string; a: string }[]>(),
    status: mysqlEnum("status", ["draft", "published"]).default("draft").notNull(),
    source: mysqlEnum("source", ["ai", "manual"]).default("manual").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
    publishedAt: timestamp("publishedAt"),
  },
  (t) => [
    // Публичный список: WHERE status='published' ORDER BY publishedAt DESC.
    index("articles_status_published_at_idx").on(t.status, t.publishedAt),
  ]
);

export type Article = typeof articles.$inferSelect;
export type InsertArticle = typeof articles.$inferInsert;

// ─── PAGE VIEWS (серверная аналитика посещаемости) ───
// Раньше считалось в localStorage браузера — каждый посетитель видел только
// свою собственную историю просмотров, дашборд админа показывал не реальный
// трафик, а лишь то, что открывал сам админ в своём браузере. Теперь каждый
// просмотр страницы шлётся на сервер (see api/analytics-router.ts).
export const pageViews = mysqlTable("page_views", {
  id: serial("id").primaryKey(),
  path: varchar("path", { length: 500 }).notNull(),
  // Random per-browser id from localStorage, no PII — lets the dashboard tell
  // "1 person, 10 pageviews" apart from "10 people, 10 pageviews". Nullable —
  // rows written before this column existed have none.
  visitorId: varchar("visitor_id", { length: 36 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => [
  // Аналитика (api/queries/analytics.ts) фильтрует по датам и группирует по
  // path — без индексов каждый дашборд-запрос сканирует всю таблицу.
  index("page_views_created_at_idx").on(t.createdAt),
  index("page_views_path_idx").on(t.path),
]);

export type PageView = typeof pageViews.$inferSelect;
export type InsertPageView = typeof pageViews.$inferInsert;

// ─── LISTING EVENTS (клики по объекту — воронка покупателя для CRM) ───
// page_views считает только сам заход на страницу объекта. Звонок, WhatsApp,
// Telegram, «поделиться» и «в избранное» раньше не попадали никуда, кроме
// Яндекс.Метрики — CRM их не видела и не могла построить воронку по объекту
// (см. api/crm-sync-router.ts GET /stats). Тот же паттерн, что page_views: своя
// узкая таблица, память как запасной режим на случай недоступной БД.
export const listingEvents = mysqlTable("listing_events", {
  id: serial("id").primaryKey(),
  listingId: int("listing_id").notNull(),
  // "phone" | "whatsapp" | "telegram" | "share" | "favorite" — не enum, чтобы
  // добавить новый вид клика без миграции (см. ту же логику у details/json выше).
  kind: varchar("kind", { length: 20 }).notNull(),
  // Тот же localStorage-id, что у page_views — визитора можно связать с
  // просмотром в CRM-воронке. Нет PII.
  visitorId: varchar("visitor_id", { length: 36 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => [
  index("listing_events_created_at_idx").on(t.createdAt),
  index("listing_events_listing_id_idx").on(t.listingId),
]);

export type ListingEvent = typeof listingEvents.$inferSelect;
export type InsertListingEvent = typeof listingEvents.$inferInsert;
