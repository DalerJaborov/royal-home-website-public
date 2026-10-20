import path from "path";
import fs from "node:fs";
const __dirname = import.meta.dirname;
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { versionPublicAssets } from "./scripts/version-public-assets";

// Чистый фронтенд-конфиг без Hono dev server.
// kimi-plugin-inspect-react намеренно НЕ подключён: это прод-сборка, а плагин
// вшивает в каждый DOM-узел атрибуты code-path с путями исходников.
export default defineConfig({
  plugins: [react(), {
    name: 'version-public-entry-assets',
    transformIndexHtml: {
      order: 'post',
      handler: (html) => versionPublicAssets(html, (name) => fs.readFileSync(path.resolve(__dirname, 'public', name))),
    },
  }, {
    name: 'keep-route-manifest-server-only',
    closeBundle() {
      fs.renameSync(path.resolve(__dirname, 'dist/public/.vite/manifest.json'),
        path.resolve(__dirname, 'dist/route-manifest.json'));
    },
  }],
  server: {
    port: 3000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@contracts": path.resolve(__dirname, "./contracts"),
      "@db": path.resolve(__dirname, "./db"),
      db: path.resolve(__dirname, "./db"),
    },
  },
  envDir: path.resolve(__dirname),
  optimizeDeps: {
    exclude: ['react-dom/client'],
  },
  build: {
    manifest: true,
    outDir: path.resolve(__dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // React/router change rarely between deploys — split into their own
        // chunk so browsers keep it cached across releases instead of
        // re-downloading it every time app code changes.
        manualChunks: {
          // jsx-runtime и react-dom/client перечислены явно — иначе Rollup
          // относил их к общему чанку вместе с прочим вендором.
          "vendor-react": ["react", "react-dom", "react/jsx-runtime", "react-dom/client", "react-router-dom"],
          // framer-motion СПЕЦИАЛЬНО не выделен в ручной чанк. Раньше здесь было
          // "vendor-motion": ["framer-motion"] с комментарием, что библиотека вне
          // критического пути, — но объявленный вручную чанк Vite прописывает в
          // index.html как <link rel="modulepreload">, и браузер тянул 127 КБ на
          // ГЛАВНОЙ с высоким приоритетом, хотя она эту библиотеку не использует
          // (главная и 404 живут на CSS-овом <Reveal>). Rollup и сам соберёт общий
          // чанк: framer-motion импортируют 12 ленивых страниц, так что копия
          // будет одна и загрузится при первом переходе.
          //
          // Проверка после сборки: в dist/public/index.html не должно остаться
          // modulepreload на чанк с framer-motion.
        },
      },
    },
  },
});
