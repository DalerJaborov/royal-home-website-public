# Public SEO operations

## What updates automatically

- Published listings receive fallback Russian and Tajik metadata on creation/sync. English pages are derived from public listing facts. Manual metadata is retained.
- Exact generated RU/TG templates follow subsequent changes in price, rooms, area, district, floor and market type through admin edits, full CRM publication and facts-only updates. Existing editorial fields are preserved independently. Database updates read the old row under the existing transaction/row lock. Local lifecycle coverage checks new drafts, publication, edits, sold offers and unpublication across all three languages without creating production fixtures.
- `/sitemap.xml` reads current published inventory and published article translations. It is not a static export. Unpublished listings do not enter the sitemap.
- A listing with a public video, a cover and a valid date receives `/listing/:id/video`. Tajik and English watch pages inherit the publication gate of the corresponding listing page. Each language has its own canonical, title, description and reciprocal alternate links.
- Video sitemap entries point to watch pages. The listing page links to its watch page; the watch page links back to the listing.
- Video bytes are streamed through `/media/listing-video/:id.mp4`. The source is resolved from the published listing and must be the existing fixed CRM public-video endpoint. GET, HEAD and byte ranges are supported. This does not expose CRM interfaces or private video files. Publication is checked on every request. Videos are not stored in the service worker's offline cache.
- `royalhome-seo-health.timer` runs daily at 02:17 UTC (07:17 Asia/Tashkent, up to five minutes of jitter). It checks the current sitemap, HTTP statuses, source HTML/H1, canonical, metadata uniqueness, actual reciprocal hreflang, structured data, video/thumbnail availability and HTTP noindex headers on the existing public Caddy origin. Missing pages and filtered catalog URLs have negative probes. It does not download full videos. It uses the existing app container's Node runtime; no database/provider credentials are passed. Reports live in the persistent `/app/data/seo` directory for 14 days, with `latest.json` for the last attempt and `last-success.json` for the last successful crawl. Failed runs retain their nonzero exit and journal entries.
- `Public SEO health` in GitHub Actions independently checks external HTTPS/Cloudflare access and saves daily mobile Lighthouse reports for Russian home, Tajik catalog and English catalog. These are lab measurements, not real-user Core Web Vitals. Reports remain available as GitHub Actions artifacts for 14 days. The initial GitHub Node crawl received HTTP 403 with `cf-mitigated: challenge`. A later VPS/public-edge crawl encountered transport timeouts to both public IPv4 edges while the fixed internal public-video handler answered in 109 ms. Those failures are retained separately. A successful origin crawl is explicitly not evidence that every URL is accessible through every Cloudflare edge or indexed by Google.
- Read-only network requests retry one transport failure, within the shared ten-minute deadline. Recovered requests retain their cause and final HTTP status in `recoveries`; HTTP failures (including Cloudflare challenges and missing resources) are not retried or hidden. Persistent transport failures retain their cause and attempt count. Assets/posters are probed with three concurrent HEAD requests, never downloaded as full videos. Progress phases and total duration are recorded. Self hreflang and `x-default` are required as well as reciprocal links.
- The browser workflow now fails on invalid/missing metrics, Lighthouse runtime errors, unexpected final URLs, failed HTTP-status audits, SEO below 100 or accessibility below 90. It retains artifacts even on failure. Lab performance is reported separately, without an arbitrary pass threshold or a claim about real-user speed.
- The origin checker uses `http://host.docker.internal` with the exact public `Host: royalhome.tj`, through the existing Caddy route (including its public-upload checks). Native HTTP is used because Fetch can discard a custom Host header. It follows no redirects. The JSON `vantage` field distinguishes `origin` from `public-edge`; the CLI still defaults to the real external HTTPS site when run without origin overrides. No DNS, firewall, Cloudflare protections or private CRM interfaces are changed.

## Video search and Meta measurement

Video watch pages provide crawlable HTML, VideoObject and video sitemap entries for Google. The video source is still an explicitly public CRM video streamed through the site. These changes establish technical eligibility, not confirmed Google video indexing.

Production Compose enables `PUBLIC_VIDEO_LOCAL_SOURCE=1`. After validating site publication, the trusted CRM source host and the fixed numeric `/api/v1/public/property-video/:id.mp4` path, the website requests that same public CRM handler over the already existing `royalhome-shared` network. No additional CRM credentials, arbitrary proxy targets or private routes are permitted. The handler's missing/publication checks remain authoritative; GET/HEAD/range/conditionals and no-cookie/redirect/content-type guards remain unchanged. This removes the website→Cloudflare→same-VPS dependency for video bytes. With the flag off, the original validated HTTPS source remains in use.

Opening a valid watch page also invokes the existing `useMetaListingView` contract, exactly as the detail page does. The server resolves the native site listing ID to the CRM catalog item; browser/CAPI use the existing shared event ID. Existing admin/pixel-disabled guards remain in effect. This is ViewContent for the property, not a video-play, Lead or Purchase event. No video-play percentages or advertising audiences are created by this change. Provider acceptance and campaign attribution require separate real-account evidence; automated tests use local mocks only.

## Release and verification

Use the current public repository and release ownership in the workspace routing guide. A protected-main PR and successful exact-revision source checks precede deployment. Save a database snapshot and the current image before rebuilding the application; retain volumes and runtime configuration. Do not run schema push for this SEO change.

After deployment, run:

```powershell
$env:SEO_CHECK_REPORT = 'D:/RoyalHome-verification-20261024/seo/production-crawl.json'
npm run check:seo
```

Also verify a real current video with HEAD and a small byte range, a watch page in each language at mobile/desktop widths, and the source/image installed on the server. Trigger the health workflow once after deployment to confirm the scheduled mechanism can complete.

To install the daily crawl after reviewed source checks, install the two `ops/systemd/royalhome-seo-health.*` files into `/etc/systemd/system/`, run `systemctl daemon-reload`, then `systemctl enable --now royalhome-seo-health.timer`. Run `systemctl start royalhome-seo-health.service` once and inspect the terminal service result plus `/app/data/seo/latest.json` before calling the monitor operational. The lock prevents overlapping manual and scheduled runs. A source-only monitor update does not require rebuilding or restarting the website application.

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
