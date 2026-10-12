import { defineConfig, type ViteDevServer, type PreviewServer } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { publicIngress } from './apps/local-service/src/publicIngress.ts';

const host = process.env.LINGOTORTE_WEB_HOST ?? '127.0.0.1';
const allowedHosts = (process.env.LINGOTORTE_WEB_ALLOWED_HOSTS ?? '').split(',').map((value) => value.trim()).filter(Boolean);
const apiTarget = process.env.LINGOTORTE_API_PROXY_TARGET;
const proxy = apiTarget ? { '/api': { target: apiTarget, changeOrigin: false, xfwd: false } } : undefined;
const ingress = apiTarget ? publicIngress((process.env.LINGOTORTE_PUBLIC_ORIGINS ?? '').split(',')) : undefined;
const ingressPlugin = {
  name: 'exact-public-ingress',
  configureServer(server: ViteDevServer) { install(server); },
  configurePreviewServer(server: PreviewServer) { install(server); },
};
function install(server: ViteDevServer | PreviewServer) {
  if (!ingress) return;
  server.middlewares.use(ingress);
  server.httpServer?.on('checkContinue', (request: IncomingMessage, response: ServerResponse) => {
    ingress(request, response, () => server.httpServer?.emit('request', request, response));
  });
}

export default defineConfig({
  plugins: [ingressPlugin],
  root: 'apps/web',
  publicDir: false,
  server: {
    host,
    // Vite's implicit CORS runs before ingress hooks and terminates OPTIONS.
    // The backend owns exact-origin API preflight; assets remain same-origin.
    cors: false,
    allowedHosts,
    ...(proxy ? { proxy } : {}),
    port: 5173,
    strictPort: true,
  },
  preview: {
    host,
    // Vite's implicit CORS runs before ingress hooks and terminates OPTIONS.
    // The backend owns exact-origin API preflight; assets remain same-origin.
    cors: false,
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
