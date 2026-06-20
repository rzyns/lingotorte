import { defineConfig } from 'vite';

export default defineConfig({
  root: 'apps/web',
  publicDir: false,
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
  },
  build: {
    outDir: '../../dist/web',
    emptyOutDir: true,
  },
});
