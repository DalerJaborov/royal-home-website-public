import { escapeHtml } from "./article-layout";

export interface CatalogPhotoListing {
  id: number; title: string; location: string; rooms: number; category?: string; imageUrls?: string[] | null;
}
export interface PhotoInspection { width: number; height: number; entropy: number }
export interface ArticlePhotoPlan {
  articleId?: number; title: string; listingId: number; sourcePhoto: string; caption: string;
  sourceHref: string; width: number; height: number; inlinePhoto?: string;
}
const districts = ["Сино", "Шохмансур", "Фирдавси", "Исмоили Сомони"];
function desiredDistrict(title: string): string | undefined {
  return districts.find((district) => title.toLowerCase().includes(district.toLowerCase()));
}
export async function planArticlePhoto(
  article: { id?: number; title: string }, listings: CatalogPhotoListing[], usedPhotos: Set<string>,
  inspect: (url: string) => Promise<PhotoInspection | null>,
): Promise<ArticlePhotoPlan | null> {
  const district = desiredDistrict(article.title);
  const commercial = /коммерч|помещен/i.test(article.title);
  const land = /участок|земл/i.test(article.title);
  const rooms = /двух|2-комн/i.test(article.title) ? 2 : /трех|трёх|3-комн/i.test(article.title) ? 3 : /одноком|1-комн/i.test(article.title) ? 1 : undefined;
  const ranked = [...listings].filter((listing) => listing.imageUrls?.length).sort((a, b) => {
    const score = (listing: CatalogPhotoListing) =>
      (district && listing.location.toLowerCase().includes(district.toLowerCase()) ? 40 : 0) +
      ((commercial ? listing.category === "COMMERCIAL" : land ? listing.category === "LAND" : !listing.category || listing.category === "APARTMENT") ? 20 : 0) +
      (rooms && listing.rooms === rooms ? 10 : 0);
    return score(b) - score(a);
  });
  for (const listing of ranked) {
    for (const photo of listing.imageUrls ?? []) {
      if (usedPhotos.has(photo) || /\/thumbs\/|[?&](?:width|w)=(?:[1-5]\d\d|\d\d)\b/i.test(photo)) continue;
      const info = await inspect(photo);
      if (!info || info.width < 900 || info.height < 500 || info.entropy < 0.8) continue;
      usedPhotos.add(photo);
      let inlinePhoto: string | undefined;
      for (const alternative of listing.imageUrls ?? []) {
        if (usedPhotos.has(alternative)) continue;
        const other = await inspect(alternative);
        if (other && other.width >= 900 && other.height >= 500 && other.entropy >= 0.8) {
          inlinePhoto = alternative; usedPhotos.add(alternative); break;
        }
      }
      return { articleId: article.id, title: article.title, listingId: listing.id, sourcePhoto: photo,
        sourceHref: `/listing/${listing.id}`, caption: `Реальное фото объекта из каталога ROYAL HOME: ${listing.location}.`,
        width: info.width, height: info.height, inlinePhoto };
    }
  }
  return null;
}
export function coverStrategy(family: string, mode: "photo" | "generated" | "mixed"): "catalog" | "neutral-illustration" {
  return mode === "photo" || (mode === "mixed" && ["pricing", "district", "comparison", "layout", "commercial"].includes(family))
    ? "catalog" : "neutral-illustration";
}
export function neutralEditorialScene(family: string): string {
  const subjects: Record<string, string> = {
    renovation: "a restrained editorial still life of paint samples, a roller and plain material swatches",
    moving: "a restrained editorial still life of two moving boxes, packing tape and keys",
    selling: "a restrained editorial still life of a camera, a cleaning cloth and house keys",
    viewing: "a restrained editorial still life of a tape measure, flashlight and house keys",
    utilities: "a restrained editorial still life of a plain water valve, key and blank maintenance notebook",
    negotiation: "a restrained editorial still life of two plain notebooks, keys and a calculator with no visible display",
  };
  return `${subjects[family] ?? "a restrained editorial still life of blank paper, house keys and material samples"}; soft natural light, warm neutral background, no city buildings, no skyline, no readable text, no logos, no hands or people. This is a clearly labelled generic illustration, never a photograph of a specific Dushanbe property.`;
}
export function photoProvenanceHtml(plan: ArticlePhotoPlan): string {
  return `<p>Обложка: ${escapeHtml(plan.caption)} <a href="${plan.sourceHref}">Посмотреть исходное объявление</a>.</p>`;
}
