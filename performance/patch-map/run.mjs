#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';

import { chromium } from 'playwright';
import { createServer } from 'vite';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const BENCHMARK_ROOT = fileURLToPath(new URL('.', import.meta.url));
const CODE_COMMIT = process.env.PATCH_MAP_CODE_COMMIT ?? 'uncommitted';
const FULL_SCALES = Object.freeze([100, 500, 1_000, 2_000, 5_000, 'production']);
const QUICK_SCALES = Object.freeze([100, 1_000]);
const WARMUPS = 2;
const MEASURED = 7;
const CPU_THROTTLE_RATE = 4;
const SEED_BASE = 0xc0de_2000;

const SCALAR_METRICS = Object.freeze({
  applicationInitMs: (trial) => trial.phases.applicationInitMs,
  normalizeMs: (trial) => trial.phases.normalizeMs,
  storeLoadMs: (trial) => trial.phases.storeLoadMs,
  rendererBuildMs: (trial) => trial.phases.rendererBuildMs,
  gpuPrepareMs: (trial) => trial.phases.gpuPrepareMs,
  firstVisibleFrameMs: (trial) => trial.phases.firstVisibleFrameMs,
  panZoomP95Ms: (trial) => trial.phases.panZoom.p95Ms,
  barVisibilitySetupCommitMs: (trial) => trial.phases.barVisibilitySetup.commitMs,
  barVisibilitySetupRenderMs: (trial) => trial.phases.barVisibilitySetup.renderMs,
  barVisibilitySetupTotalMs: (trial) => trial.phases.barVisibilitySetup.totalMs,
  fullBarAnimationScheduleMs: (trial) => trial.phases.fullBarAnimation.scheduleMs,
  fullBarAnimationP95Ms: (trial) => trial.phases.fullBarAnimation.p95Ms,
  partialBarAnimationScheduleMs: (trial) => trial.phases.partialBarAnimation.scheduleMs,
  partialBarAnimationP95Ms: (trial) => trial.phases.partialBarAnimation.p95Ms,
  cjkFallbackFirstRenderCommitMs: (trial) => trial.phases.cjkFallbackFirstRender.commitMs,
  cjkFallbackFirstRenderRenderMs: (trial) => trial.phases.cjkFallbackFirstRender.renderMs,
  cjkFallbackFirstRenderTotalMs: (trial) => trial.phases.cjkFallbackFirstRender.totalMs,
  randomTextChangeCommitMs: (trial) => trial.phases.randomTextChange.commitMs,
  randomTextChangeRenderMs: (trial) => trial.phases.randomTextChange.renderMs,
  randomTextChangeTotalMs: (trial) => trial.phases.randomTextChange.totalMs,
  hitTestBatchMs: (trial) => trial.phases.hitTestBatchMs,
  hitTestPerOperationMs: (trial) => trial.phases.hitTestPerOperationMs,
  selectionCommitMs: (trial) => trial.phases.selection.commitMs,
  selectionRenderMs: (trial) => trial.phases.selection.renderMs,
  selectionTotalMs: (trial) => trial.phases.selection.totalMs,
  resizeMs: (trial) => trial.phases.resizeMs,
  destroyMs: (trial) => trial.phases.destroyMs,
  reinitializeMs: (trial) => trial.phases.reinitializeMs,
  retainedJsHeapBytes: (trial) => trial.phases.retainedJsHeapBytes,
});

function argumentValue(name) {
  const prefix = `${name}=`;
  const inline = process.argv.find((argument) => argument.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function assertStrategy(value, label) {
  if (value !== 'mesh' && value !== 'particle') {
    throw new Error(`${label} must be "mesh" or "particle", received ${JSON.stringify(value)}`);
  }
  return value;
}

function percentile(values, quantile) {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(sorted.length * quantile) - 1);
  return sorted[index];
}

function stats(values, label) {
  if (values.length === 0 || values.some((value) => typeof value !== 'number' || !Number.isFinite(value))) {
    throw new Error(`${label} must contain finite numeric samples`);
  }
  return {
    samples: values,
    min: Math.min(...values),
    median: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    max: Math.max(...values),
  };
}

function summarizeTrials(trials, label) {
  return Object.fromEntries(
    Object.entries(SCALAR_METRICS).map(([metric, read]) => [
      metric,
      stats(trials.map(read), `${label}/${metric}`),
    ]),
  );
}

function fixed(value, digits = 2) {
  return Number(value).toFixed(digits);
}

function heap(value) {
  return Math.round(value).toLocaleString('en-US');
}

function markdownReport(output, resultPath) {
  const rows = output.runs.map((run) => {
    const summary = run.summary;
    return `| ${run.role} | ${run.strategy} | ${run.scale} | ${run.measuredRaw[0]?.diagnostics.expandedEntityCount?.toLocaleString('en-US') ?? 'n/a'} | ${fixed(summary.normalizeMs.median)} | ${fixed(summary.storeLoadMs.median)} | ${fixed(summary.rendererBuildMs.median)} | ${fixed(summary.gpuPrepareMs.median)} | ${fixed(summary.firstVisibleFrameMs.median)} | ${fixed(summary.panZoomP95Ms.p95)} | ${fixed(summary.barVisibilitySetupTotalMs.median)} | ${fixed(summary.fullBarAnimationScheduleMs.median)} | ${fixed(summary.fullBarAnimationP95Ms.p95)} | ${fixed(summary.partialBarAnimationScheduleMs.median)} | ${fixed(summary.partialBarAnimationP95Ms.p95)} | ${fixed(summary.randomTextChangeTotalMs.median)} | ${fixed(summary.hitTestPerOperationMs.median, 4)} | ${fixed(summary.selectionTotalMs.median)} | ${fixed(summary.destroyMs.median)} | ${fixed(summary.reinitializeMs.median)} | ${heap(summary.retainedJsHeapBytes.median)} |`;
  });

  const gpu = output.environment.gpu;
  return `# PatchMap ${output.mode} performance checkpoint

- Result JSON: ${resultPath}
- Implementation commit: ${output.codeCommit}
- Protocol: ${output.protocol.warmups} warmups, ${output.protocol.measured} measured trials, Chromium ${output.protocol.cpuThrottleRate}x CPU throttle
- Scales: ${output.protocol.scales.join(', ')}
- Selected strategy: ${output.selection.selectedStrategy}
- Browser errors: ${output.browser.consoleErrors.length} console, ${output.browser.pageErrors.length} page, ${output.browser.networkFailures.length} network
- WebGL: ${gpu.webgl.context ?? 'unavailable'}; ${gpu.webgl.unmaskedRenderer ?? gpu.webgl.renderer ?? 'unknown'}
- WebGPU adapter: ${gpu.webgpu.available ? gpu.webgpu.description ?? gpu.webgpu.device ?? 'available' : 'unavailable'}
- Windows native: ${output.environment.windowsNative}

| role | strategy | scale | expanded entities | normalize median ms | store load median ms | renderer build median ms | GPU prepare median ms | first frame median ms | pan/zoom trial-p95 p95 ms | hidden-bar visibility setup median ms | full bar schedule median ms | full bar trial-p95 p95 ms | partial bar schedule median ms | partial bar trial-p95 p95 ms | text change median ms | hit/op median ms | select median ms | destroy median ms | re-init median ms | retained JS heap median bytes |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${rows.join('\n')}

## Measurement limits

- Chromium with CDP 4x CPU throttling is a development proxy. Native low-end Windows measurement remains pending.
- Retained JS heap excludes DOM, browser-native, texture, and GPU allocations; the harness owns the per-trial collection method recorded in each raw trial.
- GPU timing is public-lifecycle wall time around prepare/render work, not a vendor GPU timestamp query.
- The selected rows are independent final-candidate trials, not aliases of spike samples.
`;
}

async function collectGpuMetadata(page) {
  return page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    let webgl = {
      context: null,
      vendor: null,
      renderer: null,
      version: null,
      shadingLanguageVersion: null,
      unmaskedVendor: null,
      unmaskedRenderer: null,
    };
    if (gl) {
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      webgl = {
        context: gl instanceof WebGL2RenderingContext ? 'webgl2' : 'webgl',
        vendor: gl.getParameter(gl.VENDOR),
        renderer: gl.getParameter(gl.RENDERER),
        version: gl.getParameter(gl.VERSION),
        shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
        unmaskedVendor: debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : null,
        unmaskedRenderer: debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : null,
      };
    }

    const gpu = navigator.gpu;
    if (!gpu) return { webgl, webgpu: { available: false } };
    try {
      const adapter = await gpu.requestAdapter();
      if (!adapter) return { webgl, webgpu: { available: false } };
      const info = adapter.info ?? {};
      return {
        webgl,
        webgpu: {
          available: true,
          architecture: info.architecture ?? null,
          description: info.description ?? null,
          device: info.device ?? null,
          vendor: info.vendor ?? null,
        },
      };
    } catch (error) {
      return {
        webgl,
        webgpu: {
          available: false,
          error: error instanceof Error ? error.message : String(error),
        },
      };
    }
  });
}

async function startServer(explicitUrl) {
  if (explicitUrl) return { pageUrl: explicitUrl, close: async () => {} };
  const server = await createServer({
    root: ROOT,
    configFile: false,
    logLevel: 'error',
    server: { host: '127.0.0.1', port: 0, strictPort: false },
  });
  try {
    await server.listen();
    const baseUrl = server.resolvedUrls?.local?.[0];
    if (!baseUrl) throw new Error('Vite did not expose a local benchmark URL');
    return {
      pageUrl: new URL('performance/patch-map/index.html', baseUrl).href,
      close: () => server.close(),
    };
  } catch (error) {
    try {
      await server.close();
    } catch (closeError) {
      throw new AggregateError(
        [error, closeError],
        'PatchMap benchmark server startup and cleanup both failed',
      );
    }
    throw error;
  }
}

async function runHarness(page, { role, strategy, scale, seed }) {
  const result = await page.evaluate(
    async (spec) => window.__PATCH_MAP_BENCHMARK__.run(spec),
    { strategy, scale, seed, warmups: WARMUPS, measured: MEASURED },
  );
  if (!result || !Array.isArray(result.warmupRaw) || !Array.isArray(result.measuredRaw)) {
    throw new Error(`${role}/${strategy}/${scale}: harness result must expose warmupRaw and measuredRaw`);
  }
  if (result.warmupRaw.length !== WARMUPS || result.measuredRaw.length !== MEASURED) {
    throw new Error(
      `${role}/${strategy}/${scale}: expected ${WARMUPS} warmups and ${MEASURED} measured trials, received ${result.warmupRaw.length}/${result.measuredRaw.length}`,
    );
  }
  return {
    role,
    strategy,
    scale,
    seed,
    warmupRaw: result.warmupRaw,
    measuredRaw: result.measuredRaw,
    summary: summarizeTrials(result.measuredRaw, `${role}/${strategy}/${scale}`),
    harnessEnvironment: result.environment ?? null,
  };
}

async function main() {
  const quick = process.argv.includes('--quick');
  const headed = process.argv.includes('--headed');
  const scales = quick ? QUICK_SCALES : FULL_SCALES;
  const externalUrl = argumentValue('--url');
  const selectedOverride = argumentValue('--selected');
  if (selectedOverride !== undefined) assertStrategy(selectedOverride, '--selected');

  const server = await startServer(externalUrl);
  const browser = await chromium.launch({
    headless: !headed,
    args: ['--js-flags=--expose-gc', '--enable-precise-memory-info'],
  });
  const context = await browser.newContext({
    viewport: { width: 1_280, height: 720 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  const consoleErrors = [];
  const pageErrors = [];
  const networkFailures = [];

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.stack ?? error.message));
  page.on('requestfailed', (request) => {
    networkFailures.push(
      `${request.method()} ${request.url()} ${request.failure()?.errorText ?? 'request failed'}`,
    );
  });
  page.on('response', (response) => {
    if (response.status() >= 400) {
      networkFailures.push(`${response.request().method()} ${response.url()} HTTP ${response.status()}`);
    }
  });

  let output;
  try {
    await cdp.send('Performance.enable');
    await cdp.send('HeapProfiler.enable');
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE_RATE });
    await page.goto(server.pageUrl, { waitUntil: 'networkidle' });
    await page.waitForFunction(
      () => typeof window.__PATCH_MAP_BENCHMARK__?.run === 'function',
      undefined,
      { timeout: 30_000 },
    );

    const advertisedSelection = await page.evaluate(
      () => window.__PATCH_MAP_BENCHMARK__.selectedStrategy ?? null,
    );
    const selectedStrategy = assertStrategy(
      selectedOverride ?? advertisedSelection ?? 'mesh',
      'selected strategy',
    );
    const gpu = await collectGpuMetadata(page);
    const runs = [];

    for (let scaleIndex = 0; scaleIndex < scales.length; scaleIndex += 1) {
      const scale = scales[scaleIndex];
      const seed = SEED_BASE + scaleIndex;
      for (const strategy of ['mesh', 'particle']) {
        process.stdout.write(`[core-v2-perf] spike/${strategy}/${scale}: ${WARMUPS}+${MEASURED}\n`);
        runs.push(await runHarness(page, { role: 'spike', strategy, scale, seed }));
      }
    }
    for (let scaleIndex = 0; scaleIndex < scales.length; scaleIndex += 1) {
      const scale = scales[scaleIndex];
      const seed = SEED_BASE + scaleIndex;
      process.stdout.write(`[core-v2-perf] selected/${selectedStrategy}/${scale}: ${WARMUPS}+${MEASURED}\n`);
      runs.push(
        await runHarness(page, { role: 'selected', strategy: selectedStrategy, scale, seed }),
      );
    }

    output = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      codeCommit: CODE_COMMIT,
      mode: quick ? 'quick' : 'full',
      protocol: {
        warmups: WARMUPS,
        measured: MEASURED,
        cpuThrottleRate: CPU_THROTTLE_RATE,
        scales,
      },
      selection: { selectedStrategy },
      environment: {
        platform: process.platform,
        architecture: process.arch,
        node: process.version,
        browser: browser.version(),
        userAgent: await page.evaluate(() => navigator.userAgent),
        hardwareConcurrency: await page.evaluate(() => navigator.hardwareConcurrency),
        viewport: { width: 1_280, height: 720, deviceScaleFactor: 1 },
        cpuThrottleRate: CPU_THROTTLE_RATE,
        headed,
        gpu,
        windowsNative: 'pending',
      },
      browser: { consoleErrors, pageErrors, networkFailures },
      runs,
    };
  } finally {
    await context.close();
    await browser.close();
    await server.close();
  }

  const resultsDirectory = path.join(BENCHMARK_ROOT, 'results');
  await mkdir(resultsDirectory, { recursive: true });
  const stamp = output.generatedAt.replaceAll(':', '-').replaceAll('.', '-');
  const basename = `${output.mode}-4x-${stamp}`;
  const namedJsonPath = path.join(resultsDirectory, `${basename}.json`);
  const latestJsonPath = path.join(resultsDirectory, `latest-${output.mode}-4x.json`);
  const namedMarkdownPath = path.join(resultsDirectory, `${basename}.md`);
  const latestMarkdownPath = path.join(resultsDirectory, `latest-${output.mode}-4x.md`);
  const serialized = `${JSON.stringify(output, null, 2)}\n`;
  const report = markdownReport(output, path.relative(ROOT, namedJsonPath));
  await Promise.all([
    writeFile(namedJsonPath, serialized, 'utf8'),
    writeFile(latestJsonPath, serialized, 'utf8'),
    writeFile(namedMarkdownPath, report, 'utf8'),
    writeFile(latestMarkdownPath, report, 'utf8'),
  ]);
  process.stdout.write(`${report}\n`);

  if (consoleErrors.length > 0 || pageErrors.length > 0 || networkFailures.length > 0) {
    throw new Error(`browser failures detected: ${JSON.stringify(output.browser)}`);
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
