import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';
import { createServer } from 'vite';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const fullCommitPattern = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const options = parseArgs(process.argv.slice(2));
const harnessPath = '/__patchmap_render_primitives__';
const harness = `<!doctype html>
<html lang="en">
  <head><meta charset="UTF-8"><title>Render primitive verifier</title></head>
  <body>
    <div id="host" style="width:1440px;height:900px"></div>
    <script type="module">
      import { Patchmap } from '/src/index.ts';
      import { createScalingFixture } from '/scripts/perf/synthetic-fixture.js';
      window.__PATCHMAP_RENDER_PRIMITIVES__ = Object.freeze({
        Patchmap,
        createScalingFixture,
      });
    </script>
  </body>
</html>`;

const { server, url } = await startServer();
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    deviceScaleFactor: 1,
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error));
  const response = await page.goto(url, { waitUntil: 'load' });
  assert(response?.ok(), `Harness failed with status ${response?.status()}`);
  await page.waitForFunction(
    () => typeof window.__PATCHMAP_RENDER_PRIMITIVES__?.Patchmap === 'function',
  );

  const scenarios = [];
  for (const itemCount of options.sizes) {
    const scenario = await page.evaluate(async (count) => {
      const { Patchmap, createScalingFixture } =
        window.__PATCHMAP_RENDER_PRIMITIVES__;
      const host = document.querySelector('#host');
      const patchmap = new Patchmap();

      const flatten = (value) => {
        if (!Array.isArray(value)) return value ? [value] : [];
        return value.flatMap((item) => (Array.isArray(item) ? item : [item]));
      };
      const countScene = (sceneRoot) => {
        const byType = {};
        let managed = 0;
        let total = 0;
        const stack = [...(sceneRoot?.children ?? [])];
        while (stack.length > 0) {
          const node = stack.pop();
          if (!node) continue;
          total += 1;
          if (typeof node.type === 'string') {
            managed += 1;
            byType[node.type] = (byType[node.type] ?? 0) + 1;
          }
          stack.push(...node.children);
        }
        return { byType, managed, total };
      };
      const findRenderLayers = (sceneRoot) => {
        const matches = [];
        const stack = [sceneRoot];
        while (stack.length > 0) {
          const node = stack.pop();
          if (!node) continue;
          if (node.label === 'patch-map-aggregate-render-layer') {
            matches.push(node);
          }
          stack.push(...node.children);
        }
        return matches;
      };
      const countPrimitives = (layer) => {
        const active = layer.children.filter(
          (child) => child.visible && child.renderable,
        );
        const byConstructor = {};
        let nestedChildren = 0;
        for (const child of active) {
          const rawName = child.constructor?.name ?? 'Unknown';
          const name = rawName.replace(/^_+/u, '') || 'Unknown';
          byConstructor[name] = (byConstructor[name] ?? 0) + 1;
          nestedChildren += child.children.length;
        }
        return {
          activeDirectChildren: active.length,
          attachedDirectChildren: layer.children.length,
          byConstructor,
          nestedChildren,
          inferredCompositeRaster:
            active.length === 1 && byConstructor.Sprite === 1,
        };
      };
      const capture = () => {
        const layers = findRenderLayers(patchmap.viewport);
        return {
          layerCount: layers.length,
          primitives: layers.length === 1 ? countPrimitives(layers[0]) : null,
          publicScene: countScene(patchmap.world),
        };
      };

      try {
        await patchmap.init(host, {
          app: {
            autoStart: false,
            height: 900,
            resolution: 1,
            width: 1440,
          },
          viewport: {
            plugins: {
              decelerate: { disabled: true },
              drag: { disabled: true },
              pinch: { disabled: true },
              wheel: { disabled: true },
            },
          },
        });
        patchmap.draw(createScalingFixture(count));
        patchmap.app.render();
        const initial = capture();

        const items = flatten(
          patchmap.selector('$..children[?(@.type==="item")]'),
        ).filter((item) => item?.type === 'item');
        patchmap.update({
          elements: items,
          changes: {
            components: [{
              type: 'bar',
              size: { width: '72%', height: '68%' },
              tint: '#ef4444',
              animation: false,
            }],
          },
          emit: false,
          validateSchema: false,
        });
        patchmap.app.render();
        const updated = capture();
        return { initial, itemCount: count, targetedItems: items.length, updated };
      } finally {
        patchmap.destroy();
        host.replaceChildren();
      }
    }, itemCount);

    assertScenario(scenario);
    scenarios.push(scenario);
    process.stdout.write(
      `${itemCount} items: ${scenario.initial.primitives.activeDirectChildren}`
        + ` initial / ${scenario.updated.primitives.activeDirectChildren}`
        + ' updated primitives\n',
    );
  }

  assert.equal(pageErrors.length, 0, 'Harness emitted an uncaught page error');
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    target: {
      commit: options.commit,
      entry: '/src/index.ts',
      label: options.label,
    },
    evidenceRole: 'implementation-specific-render-primitive-diagnostic',
    relativeGate: {
      status: 'oracle-blocked',
      reason: 'The approved handoff provides no reference backend primitive count.',
    },
    countingDefinition: {
      backendPrimitive:
        'active visible and renderable direct Pixi leaf attached to the '
        + 'patch-map-aggregate-render-layer',
      included: ['Graphics', 'Sprite', 'Text'],
      excluded: [
        'public compatibility handles',
        'detached pooled leaves',
        'CPU-side intermediate raster canvases',
        'viewport and aggregate grouping containers',
      ],
      nestedLeafRequirement: 0,
    },
    environment: {
      platform: process.platform,
      osRelease: os.release(),
      architecture: os.arch(),
      cpu: os.cpus()[0]?.model ?? 'unknown',
      logicalCores: os.cpus().length,
      totalMemoryBytes: os.totalmem(),
      node: process.version,
      chromium: browser.version(),
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
    },
    run: {
      sizes: options.sizes,
      workload: 'S1 draw and trusted bulk component update',
      timingEvidence: false,
    },
    scenarios,
  };
  const outputPath = resolvePerfOutput(options.output);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(`Wrote ${path.relative(root, outputPath)}\n`);
  await context.close();
} finally {
  await browser?.close();
  await server.close();
}

function assertScenario(scenario) {
  assert.equal(scenario.targetedItems, scenario.itemCount);
  for (const [phase, snapshot] of [
    ['initial', scenario.initial],
    ['updated', scenario.updated],
  ]) {
    assert.equal(snapshot.layerCount, 1, `${phase} aggregate layer count`);
    assert(snapshot.primitives, `${phase} primitive snapshot missing`);
    assert(
      snapshot.primitives.activeDirectChildren > 0,
      `${phase} must submit at least one backend primitive`,
    );
    assert.equal(
      snapshot.primitives.activeDirectChildren,
      snapshot.primitives.attachedDirectChildren,
      `${phase} render layer must not retain inactive attached leaves`,
    );
    assert.equal(
      snapshot.primitives.nestedChildren,
      0,
      `${phase} backend primitives must be leaves`,
    );
    assert.equal(
      snapshot.publicScene.byType.item,
      scenario.itemCount,
      `${phase} public item count`,
    );
  }
}

async function startServer() {
  const server = await createServer({
    appType: 'custom',
    configFile: false,
    logLevel: 'error',
    root,
    plugins: [{
      name: 'patchmap-render-primitives-harness',
      configureServer(vite) {
        vite.middlewares.use((request, response, next) => {
          if (request.url?.split('?')[0] !== harnessPath) {
            next();
            return;
          }
          response.statusCode = 200;
          response.setHeader('content-type', 'text/html; charset=utf-8');
          response.end(harness);
        });
      },
    }],
    server: { host: '127.0.0.1', port: 0, strictPort: false },
  });
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === 'string') {
    await server.close();
    throw new Error('Vite did not expose a TCP address');
  }
  return {
    server,
    url: `http://127.0.0.1:${address.port}${harnessPath}`,
  };
}

function parseArgs(args) {
  const values = new Map();
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument.startsWith('--')) {
      throw new Error(`Unexpected argument: ${argument}`);
    }
    const key = argument.slice(2);
    if (!['commit', 'label', 'output', 'sizes'].includes(key)) {
      throw new Error(`Unknown option: ${argument}`);
    }
    const value = args[++index];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for ${argument}`);
    }
    values.set(key, value);
  }
  const sizes = (values.get('sizes') ?? '100,1000')
    .split(',')
    .map((value) => Number(value));
  if (
    sizes.length === 0
    || sizes.some((value) => !Number.isSafeInteger(value) || value <= 0)
  ) {
    throw new Error('--sizes must contain positive safe integers');
  }
  const commit = values.get('commit') ?? 'unrecorded';
  if (commit !== 'unrecorded') {
    assert.match(
      commit,
      fullCommitPattern,
      '--commit must be a full 40- or 64-character hexadecimal commit ID',
    );
  }
  return {
    commit,
    label: values.get('label') ?? 'cleanroom-implementation',
    output: values.get('output') ?? '.perf-results/render-primitives-quick.json',
    sizes,
  };
}

function resolvePerfOutput(candidate) {
  const outputPath = path.resolve(root, candidate);
  const perfRoot = path.resolve(root, '.perf-results');
  const relative = path.relative(perfRoot, outputPath);
  assert(
    relative !== '..' && !relative.startsWith(`..${path.sep}`),
    'Verifier output must stay inside .perf-results',
  );
  return outputPath;
}
