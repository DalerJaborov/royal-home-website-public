# Public SEO operations

## What updates automatically

- Published listings receive fallback Russian and Tajik metadata on creation/sync. English pages are derived from public listing facts. Manual metadata is retained.
- `/sitemap.xml` reads current published inventory and published article translations. It is not a static export. Unpublished listings do not enter the sitemap.
- A listing with a public video, a cover and a valid date receives `/listing/:id/video`. Tajik and English watch pages inherit the publication gate of the corresponding listing page. Each language has its own canonical, title, description and reciprocal alternate links.
- Video sitemap entries point to watch pages. The listing page links to its watch page; the watch page links back to the listing.
- Video bytes are streamed through `/media/listing-video/:id.mp4`. The source is resolved from the published listing and must be the existing fixed CRM public-video endpoint. GET, HEAD and byte ranges are supported. This does not expose CRM interfaces or private video files. Publication is checked on every request. Videos are not stored in the service worker's offline cache.
- `Public SEO health` runs daily at 02:17 UTC (07:17 Asia/Tashkent). It checks the current sitemap, HTTP statuses, source HTML/H1, canonical, metadata uniqueness, actual reciprocal hreflang, structured data, video/thumbnail availability and HTTP noindex headers. Missing pages and filtered catalog URLs have negative probes. It does not download full videos.
- The same workflow saves mobile Lighthouse reports for Russian home, Tajik catalog and English catalog. These are lab measurements, not real-user Core Web Vitals. Reports remain available as GitHub Actions artifacts for 14 days.

## Release and verification

Use the current public repository and release ownership in the workspace routing guide. A protected-main PR and successful exact-revision source checks precede deployment. Save a database snapshot and the current image before rebuilding the application; retain volumes and runtime configuration. Do not run schema push for this SEO change.

After deployment, run:

```powershell
$env:SEO_CHECK_REPORT = 'D:/RoyalHome-verification-20261024/seo/production-crawl.json'
npm run check:seo
```

Also verify a real current video with HEAD and a small byte range, a watch page in each language at mobile/desktop widths, and the source/image installed on the server. Trigger the health workflow once after deployment to confirm the scheduled mechanism can complete.

## Search performance and editorial work

Technical health does not establish indexing, ranking, video-result eligibility or AI citations. Compare Google Search Console over equivalent 28-day windows, separated by query, page, country, device, language and search type. Do not interpret the average position of brand queries as the ranking for buying property in Dushanbe.

Priority query groups are hypotheses until Search Console confirms demand:

| Intent | Russian | Tajik | English |
| --- | --- | --- | --- |
| Buy | купить квартиру в Душанбе | харидани хона дар Душанбе | apartments for sale in Dushanbe |
| Sell | продать квартиру в Душанбе | фурӯхтани хона дар Душанбе | sell property in Dushanbe |
| District | квартиры в Сино | хонаҳо дар Сино | apartments in Sino Dushanbe |
| Agency | агентство недвижимости Душанбе | агентии амвол дар Душанбе | real estate agency in Dushanbe |

Improve existing commercial pages and real listing facts before creating many similar landing pages or articles. District pages calculate asking-price statistics from current agency inventory; they are not whole-market valuations or completed transaction prices. Publish only substantive, reviewed translations. Legal/financial material needs current primary sources and expert review. Do not invent availability, inspection claims, reviews, transaction counts or market data.

Keep the confirmed business name, office address, phone and official profiles consistent across the site and owner-controlled directories. External profile changes, outreach, review requests and link purchases are separate actions; they are not performed by this workflow.

Google's AI features use ordinary Search eligibility; a special AI file or schema does not guarantee inclusion. Training-bot settings must not be confused with search-crawler access.

## Known limitations

- Video `uploadDate` currently inherits the listing creation date from the existing implementation. It is not independently verified video-publication history. A later CRM contract should supply the real first-publication timestamp tied to the video revision; do not substitute the time of each crawl or resync.
- A video's audio language remains Russian when only its surrounding page is translated. Translated titles do not mean the video has been dubbed.
- The poster is the existing first public property photo. It is not a newly extracted video frame.
- The public video stream adds application/network traffic when a user plays a video or a crawler retrieves it. There is no full-video preload. Monitor bandwidth and source availability; use measured demand before introducing storage/CDN changes.
- The daily workflow checks source HTML and public assets. Browser interaction and visual QA remain separate release checks. It does not run Google URL Inspection or force Google to index pages.

Sources: [Google video best practices](https://developers.google.com/search/docs/appearance/video), [video sitemaps](https://developers.google.com/search/docs/crawling-indexing/sitemaps/video-sitemaps), [localized pages](https://developers.google.com/search/docs/specialty/international/localized-versions), [AI features](https://developers.google.com/search/docs/appearance/ai-features).
