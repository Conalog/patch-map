import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = fileURLToPath(new URL('../../../..', import.meta.url));
const quick = process.argv.includes('--quick');
const native = process.argv.includes('--native');
const throttleRate = native ? 1 : 4;
const warmups = quick ? 1 : 2;
const samples = quick ? 3 : 7;
const animationFrames = quick ? 6 : 12;
const hitTests = quick ? 128 : 512;
const generatedCounts = quick ? [100, 500, 1_000] : [100, 500, 1_000, 2_000, 5_000];

function round(value) {
  return Number(value.toFixed(3));
}

function tableRows(report) {
  const metrics = ['load', 'rendererInit', 'firstRender', 'bulkUpdate', 'animationFrame', 'hitTestSelection', 'teardown'];
  const rows = [];
  for (const [name, workload] of Object.entries(report.workloads)) {
    const cells = metrics.map((metric) => {
      const summary = workload.summary[metric];
      return `${round(summary.median)}/${round(summary.p95)}`;
    });
    rows.push([name, workload.entityCount, ...cells]);
  }
  return rows;
}

const server = await createServer({
  root: repoRoot,
  configFile: false,
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0, strictPort: false },
});

let browser;
try {
  await server.listen();
  const baseUrl = server.resolvedUrls?.local?.[0];
  if (!baseUrl) throw new Error('Vite did not expose a local URL');

  browser = await chromium.launch({
    headless: true,
    args: [
      '--enable-unsafe-swiftshader',
      '--disable-background-timer-throttling',
      '--js-flags=--expose-gc',
    ],
  });
  const context = await browser.newContext({ viewport: { width: 1000, height: 620 } });
  const page = await context.newPage();
  const browserErrors = [];
  page.on('pageerror', (error) => browserErrors.push(String(error.stack ?? error)));
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttleRate });
  await page.goto(`${baseUrl}performance/core-v1/spikes/flat-pixi/index.html`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => globalThis.flatPixiReady === true);

  const production = JSON.parse(await readFile(join(repoRoot, 'lab/fixtures/production-like.json'), 'utf8'));
  const result = await page.evaluate(async ({ generatedCounts: counts, productionDataset, config }) => {
    const workloads = counts.map((count) => ({
      name: `generated-${count}`,
      dataset: globalThis.generateFlatPixiWorkload(count),
    }));
    workloads.push({ name: 'production-458', dataset: productionDataset });
    return globalThis.runFlatPixiBenchmark({ workloads, ...config });
  }, {
    generatedCounts,
    productionDataset: production,
    config: { warmups, samples, animationFrames, hitTests },
  });

  const browserVersion = await browser.version();
  const report = {
    schemaVersion: 1,
    spike: 'flat-pixi',
    design: 'typed-array dense store + id-slot index + spatial buckets + chunked aggregate Pixi Graphics',
    compatibility: 'intentionally none',
    generatedAt: new Date().toISOString(),
    mode: quick ? 'quick' : 'full',
    environment: {
      platform: process.platform,
      arch: process.arch,
      node: process.version,
      browser: `Chromium ${browserVersion}`,
      renderer: 'PixiJS WebGL (headless Chromium/SwiftShader)',
      cpuThrottleRate: throttleRate,
      windowsNative: 'pending',
    },
    sampling: { warmups, samples, animationFrames, hitTests },
    contract: {
      synchronous: ['load', 'batchUpdate', 'animateStep', 'snapshot', 'query', 'hitTest'],
      renderBoundary: 'renderer.flush()',
      errorAtomicity: 'every patch validates before any store mutation',
      lifecycle: 'destroy invalidates refs and releases renderer globals',
      renderObjects: 'one Graphics per 256 entities; no per-entity DisplayObject/listener/ticker/closure',
    },
    contractChecks: result.contractChecks,
    workloads: result.workloads,
    browserErrors,
  };
  if (browserErrors.length > 0) throw new Error(`browser errors: ${browserErrors.join('\n')}`);

  await mkdir(join(here, 'results'), { recursive: true });
  const suffix = `${quick ? 'quick' : 'full'}-${throttleRate}x-${report.generatedAt.replace(/[:.]/g, '-')}.json`;
  const output = join(here, 'results', suffix);
  const latest = join(here, 'results', `latest-${quick ? 'quick' : 'full'}-${throttleRate}x.json`);
  const json = `${JSON.stringify(report, null, 2)}\n`;
  await writeFile(output, json);
  await writeFile(latest, json);

  const headers = ['workload', 'count', 'load m/p95', 'renderer init m/p95', 'first render m/p95', 'bulk+flush m/p95', 'anim frame m/p95', 'hit/select m/p95', 'destroy m/p95'];
  console.log(`flat-pixi ${quick ? 'quick' : 'full'} benchmark (${throttleRate}x CPU proxy)`);
  console.log(headers.join('\t'));
  for (const row of tableRows(report)) console.log(row.join('\t'));
  console.log(`raw=${output}`);
  console.log(`latest=${latest}`);
} finally {
  await browser?.close();
  await server.close();
}
