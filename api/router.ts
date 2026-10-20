import { authRouter } from "./auth-router";
import { listingRouter } from "./listing-router";
import { leadRouter } from "./lead-router";
import { uploadRouter } from "./upload-router";
import { cmsRouter } from "./cms-router";
import { aiRouter } from "./ai-router";
import { instagramRouter } from "./instagram-router";
import { analyticsRouter } from "./analytics-router";
import { blogRouter } from "./blog-router";
import { chatRouter } from "./chat-router";
import { metaRouter } from "./meta-router";
import { createRouter, publicQuery } from "./middleware";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  listing: listingRouter,
  lead: leadRouter,
  upload: uploadRouter,
  cms: cmsRouter,
  ai: aiRouter,
  instagram: instagramRouter,
  analytics: analyticsRouter,
  blog: blogRouter,
  chat: chatRouter,
  meta: metaRouter,
});

export type AppRouter = typeof appRouter;
