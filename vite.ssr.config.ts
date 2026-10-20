import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  publicDir: false,
  resolve: { alias: { '@': path.resolve('src'), '@contracts': path.resolve('contracts'), '@db': path.resolve('db') } },
  build: {
    ssr: 'src/entry-server.tsx', outDir: 'dist/ssr', emptyOutDir: true,
    rollupOptions: { output: { entryFileNames: 'entry-server.js' } },
  },
});
