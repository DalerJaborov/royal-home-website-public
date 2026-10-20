import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, publicQuery, adminQuery } from "./middleware";
import {
  findPublishedArticles,
  findPublishedArticleBySlug,
  findAllArticles,
  findArticleById,
  createArticle,
  updateArticle,
  deleteArticle,
} from "./queries/articles";
import { getCmsEntry, setCmsEntry } from "./queries/cms";
import {
  generateArticle,
  isGenerationInProgress,
  getBlogSetting,
  getBlogCoverMode,
  getGeminiApiKey,
  ensureUniqueSlug,
  transliterateSlug,
} from "./blog-generator";
import { generateCoverImage } from "./lib/blog-cover";
import { isGeminiProxyConfigured } from "./lib/gemini-transport";
import { sanitizeArticleHtml } from "./lib/sanitize-html";
import { articleAvailableLocales, getPublicArticleTranslation, translationSourceHash } from './lib/public-translations';
import { unavailableArticleListingIds } from './lib/article-link-availability';

/** Маска ключа для админки: наружу отдаём только последние 4 символа. */
function maskApiKey(key: unknown): string | null {
  if (typeof key !== "string" || !key.trim()) return null;
  return `••••${key.trim().slice(-4)}`;
}

export const blogRouter = createRouter({
  // ─── Публичные ───

  list: publicQuery
    .input(
      z
        .object({
          page: z.number().int().min(1).default(1),
          pageSize: z.number().int().min(1).max(50).default(24),
          locale: z.enum(['ru', 'tg', 'en']).optional(),
        })
        .optional()
    )
    .query(async ({ input }) => {
      const page = input?.page ?? 1;
      const pageSize = input?.pageSize ?? 24;
      const { items, total } = await findPublishedArticles({
        limit: pageSize,
        offset: (page - 1) * pageSize,
      });
      // Список отдаёт карточки без тяжёлого contentHtml.
      // source (ИИ/вручную) — внутренняя кухня, наружу не отдаём.
      return {
        total,
        page,
        pageSize,
        items: await Promise.all(items.map(async article => {
          const { contentHtml: _omit, source: _src, ...rest } = article;
          const supportedLocales = await articleAvailableLocales(article);
          const translation = input?.locale && input.locale !== 'ru' ? await getPublicArticleTranslation(input.locale, article) : undefined;
          return { ...rest, ...(translation ? { title: translation.title, excerpt: translation.excerpt, metaTitle: translation.metaTitle, metaDescription: translation.metaDescription, faq: translation.faq } : {}),
            supportedLocales, translationAvailable: !input?.locale || input.locale === 'ru' || !!translation };
        })),
      };
    }),

  getBySlug: publicQuery
    .input(z.object({ slug: z.string().min(1).max(255) }))
    .query(async ({ input }) => {
      const article = await findPublishedArticleBySlug(input.slug);
      if (!article) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Статья не найдена" });
      }
      // source (ИИ/вручную) — внутренняя кухня, наружу не отдаём.
      const { source: _src, ...publicArticle } = article;
      let unavailableListingIds: number[];
      try { unavailableListingIds = await unavailableArticleListingIds(publicArticle.contentHtml); }
      catch (cause) { throw new TRPCError({ code: 'SERVICE_UNAVAILABLE', message: 'Не удалось проверить объявления. Повторите позже.', cause }); }
      return { ...publicArticle, unavailableListingIds, supportedLocales: await articleAvailableLocales(publicArticle), translationSourceHash: translationSourceHash(publicArticle) };
    }),

  // ─── Админ ───

  adminList: adminQuery.query(async () => {
    const items = await findAllArticles();
    return items.map(({ contentHtml: _omit, ...rest }) => rest);
  }),

  adminGetById: adminQuery.input(z.object({ id: z.number() })).query(async ({ input }) => {
    const article = await findArticleById(input.id);
    if (!article) throw new TRPCError({ code: "NOT_FOUND", message: "Статья не найдена" });
    return article;
  }),

  generateNow: adminQuery.mutation(async () => {
    if (isGenerationInProgress()) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "Генерация уже запущена — дождитесь окончания.",
      });
    }
    try {
      return await generateArticle();
    } catch (e) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: e instanceof Error ? e.message : "Не удалось сгенерировать статью",
      });
    }
  }),

  /**
   * Перерисовать обложку одной статьи (в т.ч. написанной руками или вышедшей
   * раньше — у старых статей обложкой стоит фото объекта из каталога).
   * Ошибку показываем как есть: кнопку нажал человек и ждёт ответа, а не крон.
   */
  generateCover: adminQuery.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const article = await findArticleById(input.id);
    if (!article) throw new TRPCError({ code: "NOT_FOUND", message: "Статья не найдена" });

    const geminiKey = await getGeminiApiKey();
    if (!geminiKey) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Не задан ключ Gemini — обложку рисовать нечем (админка → Блог → Ключ Gemini API).",
      });
    }

    try {
      const coverImageUrl = await generateCoverImage(geminiKey, {
        title: article.title,
        excerpt: article.excerpt,
        // Сцену модель придумывает сама, прочитав статью: описывать картинку
        // словами человек не должен.
        contentHtml: article.contentHtml,
      });
      await updateArticle(article.id, { coverImageUrl });
      return { coverImageUrl };
    } catch (e) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: e instanceof Error ? e.message : "Не удалось нарисовать обложку",
      });
    }
  }),

  create: adminQuery
    .input(
      z.object({
        title: z.string().min(3).max(500),
        excerpt: z.string().optional(),
        contentHtml: z.string().min(1),
        metaTitle: z.string().max(255).optional(),
        metaDescription: z.string().optional(),
        coverImageUrl: z.string().nullable().optional(),
        faq: z.array(z.object({ q: z.string(), a: z.string() })).optional(),
      })
    )
    .mutation(async ({ input }) => {
      // Ручная статья из админки: slug из заголовка, всегда черновик — публикация отдельной кнопкой.
      const slug = await ensureUniqueSlug(transliterateSlug(input.title));
      const id = await createArticle({
        slug,
        title: input.title,
        excerpt: input.excerpt ?? null,
        contentHtml: sanitizeArticleHtml(input.contentHtml),
        metaTitle: input.metaTitle ?? null,
        metaDescription: input.metaDescription ?? null,
        coverImageUrl: input.coverImageUrl ?? null,
        faq: input.faq ?? null,
        status: "draft",
        source: "manual",
        publishedAt: null,
      });
      return { id: Number(id), slug };
    }),

  update: adminQuery
    .input(
      z.object({
        id: z.number(),
        title: z.string().min(3).max(500).optional(),
        excerpt: z.string().optional(),
        contentHtml: z.string().optional(),
        metaTitle: z.string().max(255).optional(),
        metaDescription: z.string().optional(),
        coverImageUrl: z.string().nullable().optional(),
        faq: z.array(z.object({ q: z.string(), a: z.string() })).optional(),
      })
    )
    .mutation(async ({ input }) => {
      // slug намеренно не редактируется: смена URL опубликованной статьи ломает SEO.
      const { id, contentHtml, ...rest } = input;
      const existing = await findArticleById(id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Статья не найдена" });
      await updateArticle(id, {
        ...rest,
        ...(contentHtml !== undefined ? { contentHtml: sanitizeArticleHtml(contentHtml) } : {}),
      });
      return { success: true };
    }),

  publish: adminQuery.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const existing = await findArticleById(input.id);
    if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Статья не найдена" });
    await updateArticle(input.id, {
      status: "published",
      // Дату публикации ставим один раз — повторная публикация не «омолаживает» статью.
      publishedAt: existing.publishedAt ?? new Date(),
    });
    return { success: true };
  }),

  unpublish: adminQuery.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    await updateArticle(input.id, { status: "draft" });
    return { success: true };
  }),

  delete: adminQuery.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    await deleteArticle(input.id);
    return { success: true };
  }),

  // ─── Настройки генератора (cms key-value; ключ ИИ наружу — только маской) ───

  settings: createRouter({
    get: adminQuery.query(async () => {
      const [autogenEnabled, autoPublish, coverMode, geminiKey, priorityTopicsRaw] = await Promise.all([
        getBlogSetting("blogAutogenEnabled"),
        getBlogSetting("blogAutoPublish"),
        getBlogCoverMode(),
        getCmsEntry("geminiApiKey"),
        getCmsEntry("blogPriorityTopics"),
      ]);
      return {
        autogenEnabled,
        autoPublish,
        coverMode,
        // Без прокси Gemini недоступен из нашего региона вообще (400 «User location
        // is not supported»): показываем в админке, чтобы не искать причину в ключе.
        geminiProxyConfigured: isGeminiProxyConfigured(),
        priorityTopics: typeof priorityTopicsRaw === "string" ? priorityTopicsRaw : "",
        geminiApiKeyMask: maskApiKey(geminiKey),
        geminiEnvKeyPresent: Boolean(process.env.GEMINI_API_KEY?.trim()),
      };
    }),

    set: adminQuery
      .input(
        z.object({
          autogenEnabled: z.boolean().optional(),
          autoPublish: z.boolean().optional(),
          coverMode: z.enum(["generated", "photo", "mixed"]).optional(),
          // Приоритетные темы/запросы (по одной на строку). Пустая строка = очистить список.
          priorityTopics: z.string().max(10000).optional(),
          // Пустая строка = удалить сохранённый ключ (останется env-ключ, если задан).
          geminiApiKey: z.string().max(300).optional(),
        })
      )
      .mutation(async ({ input }) => {
        if (input.autogenEnabled !== undefined) {
          await setCmsEntry("blogAutogenEnabled", input.autogenEnabled ? "true" : "false");
        }
        if (input.autoPublish !== undefined) {
          await setCmsEntry("blogAutoPublish", input.autoPublish ? "true" : "false");
        }
        if (input.coverMode !== undefined) {
          await setCmsEntry("blogCoverMode", input.coverMode);
        }
        if (input.priorityTopics !== undefined) {
          await setCmsEntry("blogPriorityTopics", input.priorityTopics.trim());
        }
        if (input.geminiApiKey !== undefined) {
          await setCmsEntry("geminiApiKey", input.geminiApiKey.trim());
        }
        return { success: true };
      }),
  }),
});

// Утилиты экспортируем для переиспользования (напр. будущий ручной ввод статей).
export { ensureUniqueSlug, transliterateSlug };
