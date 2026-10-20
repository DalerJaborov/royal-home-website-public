import { defineConfig } from "vitest/config";
import path from "path";

const templateRoot = path.resolve(import.meta.dirname);

export default defineConfig({
  root: templateRoot,
  resolve: {
    alias: {
      "@": path.resolve(templateRoot, "src"),
      "@contracts": path.resolve(templateRoot, "contracts"),
      // Есть в tsconfig и в сборке сервера (esbuild --alias:@db), но не здесь —
      // без этого любой тест, дотягивающийся до api/queries, падал на импорте.
      "@db": path.resolve(templateRoot, "db"),
      "@assets": path.resolve(templateRoot, "attached_assets"),
    },
  },
  test: {
    environment: "node",
    // src тоже: чистые помощники фронтенда (разбор адреса, форматирование) —
    // ровно тот код, где ошибка тихо расходится по всем экранам сразу.
    include: ["api/**/*.test.ts", "api/**/*.spec.ts", "src/**/*.test.ts"],
  },
});
