import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));
const historicalContractRoute = '/lab/core-v2';
const currentLabRoute = '/lab/patch-map';
const currentLabEntry = '/lab/patch-map/index.html';

export default defineConfig({
  root: projectRoot,
  publicDir: false,
  plugins: [
    {
      name: 'patch-map-lab-route',
      configureServer(server) {
        server.middlewares.use((request, _response, next) => {
          if (request.url !== undefined) {
            const queryIndex = request.url.indexOf('?');
            const pathname = queryIndex === -1
              ? request.url
              : request.url.slice(0, queryIndex);
            const search = queryIndex === -1 ? '' : request.url.slice(queryIndex);
            if (pathname === historicalContractRoute || pathname === currentLabRoute) {
              request.url = `${currentLabEntry}${search}`;
            }
          }
          next();
        });
      },
    },
  ],
  server: {
    fs: {
      allow: [projectRoot],
    },
  },
  build: {
    outDir: fileURLToPath(new URL('./.patch-map-lab-dist', import.meta.url)),
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: {
        lab: fileURLToPath(new URL('./lab/patch-map/index.html', import.meta.url)),
      },
    },
  },
});
