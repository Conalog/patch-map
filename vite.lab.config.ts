import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));
const currentLabRoute = '/lab/patch-map';
const currentLabEntry = '/lab/index.html';

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
            if (pathname === currentLabRoute) {
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
    outDir: fileURLToPath(new URL('./.artifacts/lab', import.meta.url)),
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: {
        lab: fileURLToPath(new URL('./lab/index.html', import.meta.url)),
      },
    },
  },
});
