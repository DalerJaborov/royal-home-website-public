export interface LegacyArticleSource { id: number; title: string; excerpt?: string | null; content?: string | null; category?: string | null; active?: boolean }
/** CMS copy is mutable: existence of an old translated snapshot is not publication of its new source. */
export function legacyArticleTranslated(post: Pick<LegacyArticleSource, 'title' | 'excerpt' | 'content'>, strings: Record<string, string>): boolean {
  if (typeof post.title !== 'string' || !post.title.trim()) return false;
  return [post.title, post.excerpt ?? '', post.content ?? ''].every(source => !source || (Object.hasOwn(strings, source) && typeof strings[source] === 'string' && !!strings[source].trim()));
}
/** Cache identity only; server publication still checks all exact source strings. */
export function legacyArticleRevision(post: Pick<LegacyArticleSource, 'title' | 'excerpt' | 'content'>): string {
  const value = JSON.stringify([post.title, post.excerpt ?? '', post.content ?? '']);
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(16);
}
