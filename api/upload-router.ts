import { z } from "zod";
import { createRouter, adminQuery } from "./middleware";
import { saveDataUrl } from "./lib/uploads";

export const uploadRouter = createRouter({
  create: adminQuery
    .input(z.object({ dataUrl: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const url = await saveDataUrl(input.dataUrl);
      return { url };
    }),
});
