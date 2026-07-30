import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));
const historicalContractRoute = '/lab/core-v2';
const currentContractEntry = '/lab/patch-map.html';

export default defineConfig({
  root: projectRoot,
  publicDir: false,
  plugins: [
    {
      name: 'patch-map-historical-contract-route',
      configureServer(server) {
        server.middlewares.use((request, _response, next) => {
          if (request.url?.startsWith(historicalContractRoute)) {
            request.url = request.url.replace(historicalContractRoute, currentContractEntry);
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
        performance: fileURLToPath(new URL('./lab/patch-map/index.html', import.meta.url)),
        contract: fileURLToPath(new URL('./lab/patch-map.html', import.meta.url)),
      },
    },
  },
});
