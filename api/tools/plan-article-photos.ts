/** Read-only candidates for owner review. Never updates articles or generates images. */
import fs from "node:fs";
import { findAllArticles } from "../queries/articles";
import { findAllListings } from "../queries/listings";
import { inspectCatalogPhoto } from "../lib/blog-cover";
import { planArticlePhoto } from "../lib/blog-photo-plan";
import type { CatalogPhotoListing, PhotoInspection } from "../lib/blog-photo-plan";

async function main() {
  const arg = (name: string) => process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);
  const articlesFile = arg("--articles"); const inventoryFile = arg("--inventory");
  const articleSnapshot = articlesFile ? JSON.parse(fs.readFileSync(articlesFile, "utf8")) : null;
  const inventorySnapshot = inventoryFile ? JSON.parse(fs.readFileSync(inventoryFile, "utf8")) : null;
  const articles: Array<{ id: number; title: string }> = articleSnapshot ? articleSnapshot.articles ?? articleSnapshot : await findAllArticles();
  const listings: CatalogPhotoListing[] = inventorySnapshot ? inventorySnapshot.result?.data?.json ?? inventorySnapshot.items ?? inventorySnapshot : await findAllListings({ sold: false });
  const cache = new Map<string, PhotoInspection | null>();
  const inspect = async (url: string) => { if (!cache.has(url)) cache.set(url, await inspectCatalogPhoto(url)); return cache.get(url)!; };
  const used = new Set<string>();
  const plans = [];
  for (const article of articles) {
    plans.push({ ...(await planArticlePhoto(article, listings, used, inspect)), articleId: article.id, title: article.title });
  }
  console.log(JSON.stringify({ previewOnly: true, mode: "candidate-photo-plan", instructions: "Кандидаты для просмотра, не массовая замена всех обложек. Применять только одобренные подходящие изображения.", plans }, null, 2));
  process.exit(0);
}
main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
