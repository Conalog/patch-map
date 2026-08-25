import os from 'node:os';
import process from 'node:process';

import { chromium } from 'playwright';
import { createServer } from 'vite';

import {
  CPU_PROFILE,
  MEASURED,
  SEED,
  WARMUPS,
  assert,
  isRecord,
} from './protocol.mjs';

export async function executeBenchmarkBrowserRun(root, options) {
  const server = await startServer(root, options.externalUrl);
  let browser;
  let context;
  try {
    browser = await chromium.launch(options.browserLaunch.launchOptions);
    context = await browser.newContext({
      viewport: { width: 1_280, height: 800 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
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
        networkFailures.push(
          `${response.request().method()} ${response.url()} HTTP ${response.status()}`,
        );
      }
    });

    await cdp.send('Performance.enable');
    await cdp.send('HeapProfiler.enable');
    await cdp.send('Emulation.setCPUThrottlingRate', {
      rate: options.cpuThrottleRate,
    });
    await page.goto(server.pageUrl, { waitUntil: 'networkidle' });
    await page.waitForFunction(
      () => typeof window.__PATCH_MAP_BENCHMARK__?.run === 'function',
    );
    const gpu = await collectGpuMetadata(page);
    assert(gpu.context === 'webgl2', 'WebGL2 context availability');
    const runs = [];
    for (const size of options.runSizes) {
      process.stdout.write(
        `[patch-map-benchmark] ${String(size)}: `
          + `${options.runWarmups}+${options.runMeasured}\n`,
      );
      runs.push(await runHarness(page, size, options.smoke));
    }
    return {
      revision: 'patch-map-benchmark-raw/1',
      generatedAt: new Date().toISOString(),
      codeCommit: options.codeCommit,
      protocol: {
        warmups: options.runWarmups,
        samples: options.runMeasured,
        sizes: options.runSizes,
        seed: SEED,
        backend: 'webgl2',
        cpuThrottleRate: options.cpuThrottleRate,
        requestedHeaded: options.requestedHeaded,
        actualMode: options.headed ? 'headed' : 'headless',
      },
      environment: {
        platform: process.platform,
        architecture: process.arch,
        nodeVersion: process.version,
        browserVersion: await browser.version(),
        browserTarget: options.browserLaunch.target,
        gpu,
        cpuProfile: CPU_PROFILE,
        measurementClass: 'chromium-development-proxy',
        osRelease: os.release(),
        cpuModel: os.cpus()[0]?.model ?? 'unknown',
        logicalCpuCount: os.cpus().length,
        totalMemoryBytes: os.totalmem(),
      },
      browser: {
        consoleErrors,
        pageErrors,
        networkFailures,
      },
      runs,
    };
  } finally {
    await context?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
    await server.close().catch(() => undefined);
  }
}

async function startServer(root, explicitUrl) {
  if (explicitUrl) return { pageUrl: explicitUrl, close: async () => {} };
  const server = await createServer({
    root,
    configFile: false,
    logLevel: 'error',
    server: { host: '127.0.0.1', port: 0, strictPort: false },
  });
  try {
    await server.listen();
    const baseUrl = server.resolvedUrls?.local?.[0];
    assert(typeof baseUrl === 'string', 'Vite benchmark URL');
    return {
      pageUrl: new URL('performance/benchmark/index.html', baseUrl).href,
      close: () => server.close(),
    };
  } catch (error) {
    await server.close().catch(() => undefined);
    throw error;
  }
}

async function collectGpuMetadata(page) {
  return page.evaluate(() => {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return { context: null };
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      context: 'webgl2',
      vendor: gl.getParameter(gl.VENDOR),
      renderer: gl.getParameter(gl.RENDERER),
      version: gl.getParameter(gl.VERSION),
      unmaskedVendor: debugInfo
        ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)
        : null,
      unmaskedRenderer: debugInfo
        ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
        : null,
    };
  });
}

async function runHarness(page, size, smoke) {
  const warmups = smoke ? 0 : WARMUPS;
  const measured = smoke ? 1 : MEASURED;
  const result = await page.evaluate(
    async (spec) => window.__PATCH_MAP_BENCHMARK__.run(spec),
    {
      size,
      seed: SEED,
      warmups,
      measured,
      mode: smoke ? 'smoke' : 'benchmark',
    },
  );
  assert(isRecord(result), `${String(size)} harness result`);
  assert(Array.isArray(result.warmupRaw), `${String(size)} warmup raw`);
  assert(Array.isArray(result.measuredRaw), `${String(size)} measured raw`);
  assert(result.warmupRaw.length === warmups, `${String(size)} warmup count`);
  assert(result.measuredRaw.length === measured, `${String(size)} measured count`);
  return {
    size,
    seed: SEED,
    warmupRaw: result.warmupRaw,
    measuredRaw: result.measuredRaw,
    environment: result.environment,
  };
}
