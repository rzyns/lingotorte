import { defineConfig } from 'vite';

const host = process.env.LINGOTORTE_WEB_HOST ?? '127.0.0.1';
const allowedHosts = (process.env.LINGOTORTE_WEB_ALLOWED_HOSTS ?? '').split(',').map((value) => value.trim()).filter(Boolean);
const apiTarget = process.env.LINGOTORTE_API_PROXY_TARGET;
const proxy = apiTarget ? { '/api': { target: apiTarget } } : undefined;

export default defineConfig({
  root: 'apps/web',
  publicDir: false,
  server: {
    host,
    allowedHosts,
    ...(proxy ? { proxy } : {}),
    port: 5173,
    strictPort: true,
  },
  preview: {
    host,
    allowedHosts,
    ...(proxy ? { proxy } : {}),
    port: 4173,
    strictPort: true,
  },
  build: {
    outDir: '../../dist/web',
    emptyOutDir: true,
  },
});
