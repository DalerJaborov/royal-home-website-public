import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { articleTranslationSource, type ArticleTranslationSource, type PublicLocale, type PublicLocaleDictionary, type PublishedArticleTranslation } from '@contracts/public-i18n';
import { normalizeCompanyPublicValue, normalizePublicCmsEntry } from '@contracts/company-contacts';
import { sanitizeArticleHtml } from './sanitize-html';

const cache = new Map<string, { mtime: number; value: unknown }>();
const sanitizedArticles = new WeakMap<object, PublishedArticleTranslation>();
const invalidFiles = new Map<string, number>();
/** Only fixed language names and numeric IDs reach the filesystem. No public arbitrary-key reader. */
async function readPublishedJson(relative: string, persistent = false): Promise<unknown[]> {
  const roots = [...(persistent ? [path.resolve('uploads/locales')] : []), path.resolve('dist/public/locales'), path.resolve('public/locales')];
  const results: unknown[] = [];
  for (const root of roots) {
    const file = path.join(root, relative);
    try {
      const info = await stat(file);
      if (invalidFiles.get(file) === info.mtimeMs) continue;
      if (info.size > 2_000_000) {
        invalidFiles.set(file, info.mtimeMs);
        console.error(`[locales] Oversized public translation skipped: ${relative}`);
        continue;
      }
      const hit = cache.get(file);
      if (hit?.mtime === info.mtimeMs) { results.push(hit.value); continue; }
      const json = await readFile(file, 'utf8');
      let value: unknown;
      try {
        const raw = JSON.parse(json);
        value = normalizeCompanyPublicValue(raw);
        if (['tg.json', 'en.json'].includes(relative) && raw?.cms && typeof raw.cms === 'object' && !Array.isArray(raw.cms)) {
          // Site WhatsApp has a distinct role; generic prose normalization cannot infer it.
          (value as Record<string, unknown>).cms = Object.fromEntries(Object.entries(raw.cms).map(([key, entry]) => [key, normalizePublicCmsEntry(key, entry)]));
        }
      }
      catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
        invalidFiles.set(file, info.mtimeMs);
        console.error(`[locales] Invalid public translation JSON skipped: ${relative}`);
        continue;
      }
      invalidFiles.delete(file);
      cache.set(file, { mtime: info.mtimeMs, value });
      results.push(value);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  return results;
}
export async function getPublicDictionary(locale: PublicLocale): Promise<PublicLocaleDictionary | undefined> {
  if (locale === 'ru') return undefined;
  const [value] = await readPublishedJson(`${locale}.json`);
  if (!value || typeof value !== 'object' || !('strings' in value) || !value.strings || typeof value.strings !== 'object') return undefined;
  return value as PublicLocaleDictionary;
}
export function translationSourceHash(source: ArticleTranslationSource): string {
  return createHash('sha256').update(articleTranslationSource(source), 'utf8').digest('hex');
}
export async function getPublicArticleTranslation(locale: PublicLocale, source: ArticleTranslationSource): Promise<PublishedArticleTranslation | undefined> {
  if (locale === 'ru' || !Number.isSafeInteger(source.id) || source.id < 1) return undefined;
  const hash = translationSourceHash(source);
  // Preserve the currently published revision during a multilingual editorial
  // release: a versioned public archive can outlive a static-file deployment.
  const candidates = [
    ...await readPublishedJson(`${locale}/articles/${source.id}-${hash}.json`, true),
    ...await readPublishedJson(`${locale}/articles/${source.id}.json`, true),
  ];
  for (const value of candidates) {
    if (!value || typeof value !== 'object') continue;
    const translation = value as PublishedArticleTranslation;
    if (translation.sourceHash !== hash || typeof translation.title !== 'string' || !translation.title.trim() || typeof translation.contentHtml !== 'string' || !translation.contentHtml.trim()) continue;
    const hit = sanitizedArticles.get(translation);
    if (hit) return hit;
    const sanitized = { ...translation, contentHtml: sanitizeArticleHtml(translation.contentHtml) };
    sanitizedArticles.set(translation, sanitized);
    return sanitized;
  }
  return undefined;
}
export async function articleAvailableLocales(source: ArticleTranslationSource): Promise<PublicLocale[]> {
  const translated = await Promise.all((['tg', 'en'] as const).map(async locale => {
    const dictionary = await getPublicDictionary(locale);
    return dictionary?.completedPages?.includes('/blog') && await getPublicArticleTranslation(locale, source) ? locale : undefined;
  }));
  return ['ru', ...translated.filter((locale): locale is 'tg' | 'en' => !!locale)];
}
export async function completedLocalePages() {
  const [tg, en] = await Promise.all([getPublicDictionary('tg'), getPublicDictionary('en')]);
  return { tg: tg?.completedPages ?? [], en: en?.completedPages ?? [] };
}
