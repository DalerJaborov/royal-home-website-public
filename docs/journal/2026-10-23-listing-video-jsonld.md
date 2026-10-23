# VideoObject on the listing page and video entries in the sitemap

61 of 70 listings now have a video (`listings.video_url`). Google can only show it in search if the page and the sitemap describe it.

- JSON-LD: `listingJsonLd` (`contracts/listing-jsonld.ts`) puts a `VideoObject` into the `video` property of the existing `RealEstateListing`, so the current block stays as it was. One builder serves all three producers: server HTML in Russian (`api/lib/prerenderSeo.ts`), server HTML in Tajik and English (`api/lib/localized-seo.ts`) and the client (`ListingDetailPage.tsx`), so Google sees it without JavaScript and the client replacement agrees with it. Serialising goes through the existing `<` to `\u003c` escaping in `injectSeo`.
- Fields follow https://developers.google.com/search/docs/appearance/structured-data/video: required `name`, `thumbnailUrl`, `uploadDate`; recommended `contentUrl`, `description`. If the video link, the first photo or the date is missing, the whole object is omitted (an incomplete one would be a structured-data error).
- `uploadDate` is the listing's `createdAt` written as ISO 8601 with `+05:00` (`dushanbeIso`). The site stores no separate video date; `createdAt` is stable, `updatedAt` moves on every CRM sync. The client now carries `createdAt` through `mapServerListing`.
- `description` is the page's public meta description (district, area, price). The builder receives no floor or street, so none can leak into the video block; a test asserts the floor is absent.
- `inLanguage` is `ru` and becomes `tg`/`en` through `localizedStructuredData` (`VideoObject` added to its list).
- Sitemap: `api/lib/sitemap.ts` adds `<video:video>` (thumbnail_loc, title, description, content_loc, publication_date) to the Russian URL of a listing with a video and a cover; localized URLs are not duplicated. Namespace `xmlns:video` added.
- `scripts/check-public-seo.mjs`: any `VideoObject` must have name, https thumbnail, dated `uploadDate` with a zone and https `contentUrl`; a URL whose sitemap entry has `<video:video>` must carry a `VideoObject`.
- Not verified: Google's Rich Results Test / Search Console on production (needs the deploy). No schema change.
