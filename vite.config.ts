import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const path = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));

export default defineConfig({
  root: path('src/ui'),
  build: {
    outDir: path('dist/ui'),
    emptyOutDir: true,
  },
  server: {
    proxy: { '/api/': process.env.API_URL ?? 'http://localhost:8080' },
  },
  test: {
    root: path('.'),
  },
});
