import { eq } from "drizzle-orm";
import { getDb, isDbAvailable } from "./connection";
import { cmsEntries } from "@db/schema";
import { normalizePublicCmsEntry } from '@contracts/company-contacts';

// Dev fallback when no DATABASE_URL — resets on server restart.
const memoryCms = new Map<string, unknown>();

// Служебные/секретные ключи, которые НЕЛЬЗЯ отдавать публичным cms.getAll:
// anthropicApiKey/geminiApiKey — секреты; настройки блог-генератора публике не нужны
// (админка читает их через отдельный admin-only blog.settings.get).
const HIDDEN_CMS_KEYS = new Set([
  "anthropicApiKey",
  "geminiApiKey",
  "blogAiProvider",
  "blogAutogenEnabled",
  "blogAutogenRetryAt",
  "blogAutoPublish",
  "blogPriorityTopics",
  "blogCoverMode",
]);
const isHiddenPublicKey = (key: string) => HIDDEN_CMS_KEYS.has(key) || key.startsWith('i18n.');

export async function getAllCmsEntries(): Promise<Record<string, unknown>> {
  if (!isDbAvailable()) {
    return Object.fromEntries([...memoryCms].filter(([k]) => !isHiddenPublicKey(k)).map(([key, value]) => [key, normalizePublicCmsEntry(key, value)]));
  }
  const rows = await getDb()!.select().from(cmsEntries);
  return Object.fromEntries(rows.filter((r) => !isHiddenPublicKey(r.key)).map((r) => [r.key, normalizePublicCmsEntry(r.key, r.value)]));
}

/** Reads a single CMS entry without deserializing the whole table —
 * for hot paths like the catalog's category-visibility check. */
export async function getCmsEntry(key: string): Promise<unknown> {
  if (!isDbAvailable()) {
    return normalizePublicCmsEntry(key, memoryCms.get(key));
  }
  const [row] = await getDb()!.select().from(cmsEntries).where(eq(cmsEntries.key, key));
  return normalizePublicCmsEntry(key, row?.value);
}

export async function setCmsEntry(key: string, value: unknown) {
  value = normalizePublicCmsEntry(key, value);
  if (!isDbAvailable()) {
    memoryCms.set(key, value);
    return;
  }
  await getDb()!
    .insert(cmsEntries)
    .values({ key, value })
    .onDuplicateKeyUpdate({ set: { value } });
}
