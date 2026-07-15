import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../../../..');
const quick = process.argv.includes('--quick');
const config = quick
  ? { sizes: [100, 500, 1000], warmups: 2, samples: 5 }
  : { sizes: [100, 500, 1000, 2000, 5000], warmups: 2, samples: 7 };
const production = JSON.parse(await readFile(join(root, 'lab/fixtures/production-like.json'), 'utf8'));
const mime = { '.html': 'text/html', '.mjs': 'text/javascript' };
const server = createServer(async (request, response) => {
  try {
    const name = request.url === '/' ? 'harness.html' : request.url.slice(1);
    if (!['harness.html', 'harness.mjs', 'core.mjs', 'workloads.mjs'].includes(name)) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { 'content-type': mime[extname(name)] ?? 'text/plain', 'cache-control': 'no-store' });
    response.end(await readFile(join(here, name)));
  } catch (error) {
    response.writeHead(500).end(String(error));
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
let browser;
try {
  browser = await chromium.launch({ headless: true, args: ['--enable-precise-memory-info'] });
  const page = await browser.newPage();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.goto(`http://127.0.0.1:${address.port}/`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.typedCanvasReady === true);
  const contractChecks = await page.evaluate(() => window.runTypedCanvasContractChecks());
  if (!contractChecks.passed) throw new Error(`contract checks failed: ${JSON.stringify(contractChecks.checks)}`);
  const workloads = await page.evaluate(({ production, config }) => window.runTypedCanvasSpike({ production, ...config }), { production, config });
  const result = {
    spike: 'dense typed buffers + aggregate Canvas2D paths',
    generatedAt: new Date().toISOString(),
    mode: quick ? 'quick' : 'full',
    environment: {
      cpuThrottleRate: 4,
      userAgent: await page.evaluate(() => navigator.userAgent),
      platform: process.platform,
      node: process.version,
      windowsNative: 'pending',
    },
    config,
    contractChecks,
    workloads,
  };
  const suffix = quick ? 'quick' : 'full';
  await writeFile(join(here, `results.${suffix}.json`), `${JSON.stringify(result, null, 2)}\n`);
  const lines = [
    '# Typed Canvas spike results', '',
    `Mode: ${result.mode}; Chromium CPU throttle: 4×; warmups: ${config.warmups}; measured runs: ${config.samples}; contract checks: pass.`, '',
    '| workload | entities | load median/p95 | first render median/p95 | trusted update median/p95 | validated update median/p95 | animation frame median/p95 | hit/select median/p95 | teardown median/p95 |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];
  const fmt = (metric) => `${metric.median.toFixed(3)}/${metric.p95.toFixed(3)}`;
  for (const workload of workloads) {
    const m = workload.metrics;
    lines.push(`| ${workload.name} | ${workload.entityCount} | ${fmt(m.load)} | ${fmt(m.firstRender)} | ${fmt(m.trustedBulkUpdate)} | ${fmt(m.validatedBulkUpdate)} | ${fmt(m.animationFrame)} | ${fmt(m.hitTestSelection)} | ${fmt(m.teardown)} |`);
  }
  lines.push('', 'All values are milliseconds; hit/select is milliseconds per operation. Raw samples are preserved in the adjacent JSON. Canvas2D exposes no portable GPU-upload counter. Windows-native measurement is pending.');
  await writeFile(join(here, `RESULTS.${suffix}.md`), `${lines.join('\n')}\n`);
  console.log(lines.join('\n'));
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
