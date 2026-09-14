import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { defineConfig } from 'vite';

const id = 'patch-map-builtin-font-data';
export default defineConfig({
  cacheDir: '.artifacts/flutter/vite-cache',
  server: { watch: { ignored: ['**/packages/**/build/**', '**/.artifacts/**'] } },
  optimizeDeps: { include: ['pixi.js', 'pixi.js/prepare', 'pixi.js/accessibility'] },
  plugins: [{
    name: 'patch-map-conformance-font',
    configureServer(server) {
      server.middlewares.use('/__conformance/result', (request, response, next) => {
        if (request.method !== 'POST') return next();
        const chunks: Buffer[] = [];
        let length = 0;
        request.on('data', (chunk: Buffer) => {
          length += chunk.length;
          if (length > 16 * 1024 * 1024) { response.writeHead(413).end(); request.destroy(); return; }
          chunks.push(chunk);
        });
        request.on('end', () => { void (async () => {
          try {
            const payload = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { schemaRevision?: string };
            if (payload.schemaRevision !== 'patch-map-conformance/1') throw new Error('Invalid trace envelope');
            await mkdir('.artifacts/flutter', { recursive: true });
            await writeFile('.artifacts/flutter/npm-public.json', JSON.stringify(payload, null, 2));
            response.writeHead(204).end();
          } catch { response.writeHead(400).end(); }
        })(); });
      });
    },
    resolveId(source) { return source === id ? `\0${id}` : null; },
    load(source) {
      if (source !== `\0${id}`) return null;
      const bytes = readFileSync(new URL('../../src/resources/fonts/FiraCode-VF.woff2', import.meta.url));
      return `export default ${JSON.stringify(`data:font/woff2;base64,${bytes.toString('base64')}`)};`;
    },
  }],
});
