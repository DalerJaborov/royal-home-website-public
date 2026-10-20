/** A property advertisement is a real-estate listing, not a retail product.
 * This describes public facts; it does not promise a Google rich-result feature.
 */
export function listingJsonLd(input: {
  title: string; description?: string; images: string[]; url: string;
  price: number; rooms: number; area: number; sold: boolean; category?: string;
}) {
  const residential = !input.category || input.category === "APARTMENT" || input.category === "HOUSE";
  return {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    name: input.title,
    description: input.description || undefined,
    ...(input.images.length ? { image: input.images } : {}),
    url: input.url,
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
