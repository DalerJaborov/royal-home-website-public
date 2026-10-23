# Listing video as the second gallery slide

The CRM now sends an optional `videoUrl` (public mp4 on crm.royalhome.tj) in the `/api/v1/crm/listings` sync body. The site stores it in the new nullable `listings.video_url` column and the listing page shows it as the second gallery slide (photo 1, video, photo 2…).

- Sync: `videoUrl` is parsed like `instagramUrl` (`.catch(undefined)`, a broken value never fails the batch) and then restricted to an https link on the CRM host (`api/lib/crm-video-url.ts`). A publish without a usable link clears the stored one (`null`, not `undefined`).
- Playback: `<video controls playsInline preload="none">` with the first photo as poster, so the file is not fetched from the CRM until play. Leaving the slide pauses it. Swipes starting on the native control bar are left to the player.
- CSP: `media-src` allows the CRM host (`api/boot.ts`), checked in `api/boot-meta-csp.test.ts`.
- Schema change: run `db-push` once after the deploy (see `docker-compose.prod.yml`); until then the new column is missing and listing queries fail.
