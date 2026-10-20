import { z } from "zod";
import { createRouter, publicQuery, adminQuery } from "./middleware";
import { getAllCmsEntries, getCmsEntry, setCmsEntry } from "./queries/cms";
import { legacyArticleTranslated, legacyArticleRevision, type LegacyArticleSource } from '@contracts/legacy-article-i18n';
import { getPublicDictionary } from './lib/public-translations';
import { type PublicLocale } from '@contracts/public-i18n';

// Section keys mirror CmsData on the frontend (src/contexts/CmsContext.tsx).
const SECTION_KEYS = [
  "hero",
  "banners",
  "dushanbeBanner",
  "services",
  "blogPosts",
  "site",
  // Was missing while the frontend's updateReels persisted under this key —
  // reels edits silently failed zod validation and were lost on reload.
  "reels",
  // { APARTMENT?: boolean, HOUSE?: boolean, COMMERCIAL?: boolean, LAND?: boolean } —
  // which CRM-synced property categories show on the public catalog.
  // All categories default visible (opt-out via admin toggles). See queries/listings.ts.
  "categoryVisibility",
  // BankItem[] — банки-партнёры и ставки для страницы «Ипотека» (правятся в админке).
  "banks",
] as const;

export const cmsRouter = createRouter({
  // Public — visitors need hero/banners/services/blog/site settings to render pages.
  getAll: publicQuery.query(async () => {
    return getAllCmsEntries();
  }),

  legacyArticleLocales: publicQuery.input(z.object({ id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), revision: z.string().max(32).optional() })).query(async ({ input }) => {
    const posts = await getCmsEntry('blogPosts') as LegacyArticleSource[] | undefined;
    const source = posts?.find(post => post.id === input.id && post.active !== false);
    const supportedLocales: PublicLocale[] = source ? ['ru'] : [];
    if (source) for (const locale of ['tg', 'en'] as const) {
      const dictionary = await getPublicDictionary(locale);
      if (dictionary?.completedPages?.includes(`/blog/${source.id}`) && legacyArticleTranslated(source, dictionary.strings)) supportedLocales.push(locale);
    }
    return { supportedLocales, revision: source ? legacyArticleRevision(source) : null };
  }),

  set: adminQuery
    .input(
      z
        .object({
          key: z.enum(SECTION_KEYS),
          value: z.unknown(),
        })
        // Ключ проверялся, значение — нет: `z.unknown()` пропускал строку, число и
        // null на место объекта или массива. Клиент читает эти разделы напрямую
        // (cms.hero.variant, cms.services.map(...)), поэтому одно неверное значение
        // роняло рендер публичной страницы в белый экран — и починить его можно было
        // только через ту же админку, которая перестала открываться.
        // Проверяем ФОРМУ верхнего уровня: содержимое разделов правит человек, и
        // описывать каждое поле здесь значило бы держать вторую копию CmsData.
        .superRefine((input, ctx) => {
          const expectsArray: readonly string[] = ["services", "blogPosts", "reels", "banks"];
          const value = input.value;
          const isPlainObject = typeof value === "object" && value !== null && !Array.isArray(value);

          if (expectsArray.includes(input.key)) {
            if (!Array.isArray(value)) {
              ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["value"], message: `Раздел «${input.key}» — список` });
            }
            return;
          }
          if (!isPlainObject) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["value"], message: `Раздел «${input.key}» — объект` });
          }
        })
    )
    .mutation(async ({ input }) => {
      await setCmsEntry(input.key, input.value);
      return { success: true };
    }),
});
