/** Душанбе живёт в UTC+5 без перехода на летнее время: ISO 8601 с явным
 * смещением, как требует Google для uploadDate (без пояса берётся пояс Googlebot). */
export function dushanbeIso(value: Date | string | null | undefined): string | undefined {
  const date = value instanceof Date ? value : value ? new Date(value) : undefined;
  if (!date || !Number.isFinite(date.getTime())) return undefined;
  return `${new Date(date.getTime() + 5 * 3_600_000).toISOString().slice(0, 19)}+05:00`;
}

/** A property advertisement is a real-estate listing, not a retail product.
 * This describes public facts; it does not promise a Google rich-result feature.
 */
export function listingJsonLd(input: {
  title: string; description?: string; images: string[]; url: string;
  price: number; rooms: number; area: number; sold: boolean; category?: string;
  /** Публичный mp4 объекта (listings.video_url) и дата, с которой объект на сайте. */
  videoUrl?: string | null; uploadDate?: Date | string | null;
}) {
  // Google: name, thumbnailUrl и uploadDate обязательны, contentUrl рекомендован
  // (https://developers.google.com/search/docs/appearance/structured-data/video).
  // Без любого из обязательных полей блок невалиден — тогда его не выводим вовсе.
  // Описание — то же публичное описание страницы (район, площадь, цена): точного
  // адреса и этажа у этого сериализатора нет, и подмешивать их сюда нельзя.
  const uploadDate = dushanbeIso(input.uploadDate);
  const video = input.videoUrl && input.images[0] && uploadDate ? {
    "@type": "VideoObject",
    name: input.title,
    ...(input.description ? { description: input.description } : {}),
    thumbnailUrl: [input.images[0]],
    uploadDate,
    contentUrl: input.videoUrl,
    inLanguage: "ru",
  } : undefined;
  const residential = !input.category || input.category === "APARTMENT" || input.category === "HOUSE";
  return {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    name: input.title,
    description: input.description || undefined,
    ...(input.images.length ? { image: input.images } : {}),
    url: input.url,
    ...(video ? { video } : {}),
    about: {
      "@type": residential ? input.category === "HOUSE" ? "House" : "Apartment" : "Place",
      name: input.title,
      address: { "@type": "PostalAddress", addressLocality: "Душанбе", addressCountry: "TJ" },
      ...(residential ? {
        numberOfRooms: input.rooms,
        floorSize: { "@type": "QuantitativeValue", value: input.area, unitCode: "MTK" },
      } : {}),
    },
    offers: {
      "@type": "Offer",
      price: input.price,
      priceCurrency: "TJS",
      availability: input.sold ? "https://schema.org/SoldOut" : "https://schema.org/InStock",
      url: input.url,
    },
    breadcrumb: {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Главная", item: "https://royalhome.tj/" },
        { "@type": "ListItem", position: 2, name: "Каталог", item: "https://royalhome.tj/listings" },
        { "@type": "ListItem", position: 3, name: input.title, item: input.url },
      ],
    },
  };
}
