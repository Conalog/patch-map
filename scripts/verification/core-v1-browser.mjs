import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../..', import.meta.url));
const screenshotPath = fileURLToPath(new URL('../../artifacts/core-v1/lab.png', import.meta.url));
const suppliedUrl = process.env.CORE_V1_LAB_URL;
const port = Number(process.env.CORE_V1_LAB_PORT ?? 4175);
const baseUrl = suppliedUrl ?? `http://127.0.0.1:${port}`;
const server = suppliedUrl === undefined ? await startServer(port) : null;
const browser = await chromium.launch({ headless: process.env.HEADED !== '1' });
const results = [];

try {
  await mkdir(fileURLToPath(new URL('../../artifacts/core-v1', import.meta.url)), { recursive: true });
  results.push(await runSynthetic(browser));
  results.push(await runProduction(browser));
  results.push(await runResponsive(browser));

  const failures = results.flatMap((result) => result.failures.map((failure) => `${result.name}: ${failure}`));
  const summary = {
    url: baseUrl,
    screenshot: screenshotPath,
    results,
    failures,
  };
  console.log(JSON.stringify(summary, null, 2));
  if (failures.length > 0) process.exitCode = 1;
} finally {
  await browser.close();
  if (server !== null) server.kill('SIGTERM');
}

async function runSynthetic(browser) {
  const started = performance.now();
  const context = await browser.newContext({ viewport: { width: 1520, height: 980 } });
  const page = await context.newPage();
  const failures = captureFailures(page);
  try {
    await page.goto(`${baseUrl}/lab/performance-v1/index.html?dataset=100`, {
      waitUntil: 'networkidle',
      timeout: 30_000,
    });
    await page.waitForFunction(() => document.body.dataset.labReady === 'true');
    assertEqual(await text(page, 'dataset-select', 'value'), '100', 'synthetic dataset query restore');

    const blankPixels = await canvasFingerprint(page);
    await page.getByTestId('load').click();
    await waitReady(page);
    assertEqual(await text(page, 'metric-entities'), '100', 'synthetic entity count');
    assertEqual(await text(page, 'metric-frame-revision'), '—', 'load does not publish a frame');

    await page.getByTestId('flush').click();
    await waitReady(page);
    const firstFramePixels = await canvasFingerprint(page);
    if (firstFramePixels === blankPixels) throw new Error('first flush did not change canvas pixels');

    const publishedRevision = await text(page, 'metric-frame-revision');
    await page.getByTestId('trusted-commit').click();
    await waitReady(page);
    assertEqual(
      await text(page, 'metric-frame-revision'),
      publishedRevision,
      'commit retains prior frame revision',
    );
    const stateRevision = await text(page, 'metric-revision');
    if (stateRevision === publishedRevision) throw new Error('trusted commit did not advance state revision');

    await page.getByTestId('flush').click();
    await waitReady(page);
    assertEqual(await text(page, 'metric-frame-revision'), stateRevision, 'flush publishes state revision');

    await page.getByTestId('advance').click();
    await waitReady(page);
    const activeAnimations = numberText(await text(page, 'metric-animations'));
    if (activeAnimations <= 0) throw new Error('advance did not schedule bar animations');
    await page.getByTestId('flush').click();
    await waitReady(page);

    await page.getByTestId('hit-select').click();
    await waitReady(page);
    assertEqual(await text(page, 'metric-selection'), '1', 'hit test selection');
    if ((await page.locator('[data-testid="invariant-row"][data-status="fail"]').count()) !== 0) {
      throw new Error('synthetic flow contains failing invariants');
    }

    await page.getByTestId('teardown').click();
    await waitStatus(page, 'OFFLINE');
    assertEqual(await text(page, 'metric-entities'), '0', 'teardown clears entity count');
    await page.getByTestId('reinit').click();
    await waitReady(page);
    assertEqual(await text(page, 'metric-revision'), '0', 're-init starts at revision zero');

    await page.getByTestId('load').click();
    await waitReady(page);
    await page.getByTestId('flush').click();
    await waitReady(page);

    await page.getByTestId('auto-replay').click();
    await waitReady(page, 30_000);
    const autoInvariant = page
      .locator('[data-testid="invariant-row"][data-status="pass"]')
      .filter({ hasText: 'Auto replay completed' });
    if ((await autoInvariant.count()) !== 1) throw new Error('auto replay did not publish its PASS invariant');

    await page.screenshot({ path: screenshotPath, fullPage: true });
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  } finally {
    await context.close();
  }
  return {
    name: 'synthetic-fresh-page',
    durationMs: round(performance.now() - started),
    failures,
  };
}

async function runProduction(browser) {
  const started = performance.now();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const failures = captureFailures(page);
  try {
    await page.goto(`${baseUrl}/lab/performance-v1/index.html?dataset=production`, {
      waitUntil: 'networkidle',
      timeout: 30_000,
    });
    await page.waitForFunction(() => document.body.dataset.labReady === 'true');
    assertEqual(await text(page, 'dataset-select', 'value'), 'production', 'production query restore');
    await page.getByTestId('load').click();
    await waitReady(page, 45_000);
    const count = numberText(await text(page, 'metric-entities'));
    if (count <= 458) throw new Error(`production conversion only yielded ${String(count)} entities`);
    const fixture = await text(page, 'metric-fixture');
    if (!fixture.includes('VERIFIED')) throw new Error(`production fixture is not verified: ${fixture}`);
    await page.getByTestId('flush').click();
    await waitReady(page, 45_000);
    if (numberText(await text(page, 'metric-commands')) <= 0) {
      throw new Error('production frame reported no Canvas2D commands');
    }
    if ((await page.locator('[data-testid="invariant-row"][data-status="fail"]').count()) !== 0) {
      throw new Error('production flow contains failing invariants');
    }
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  } finally {
    await context.close();
  }
  return {
    name: 'production-fresh-page',
    durationMs: round(performance.now() - started),
    failures,
  };
}

async function runResponsive(browser) {
  const started = performance.now();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const failures = captureFailures(page);
  try {
    await page.goto(`${baseUrl}/lab/performance-v1/index.html?dataset=500`, {
      waitUntil: 'networkidle',
      timeout: 30_000,
    });
    await page.waitForFunction(() => document.body.dataset.labReady === 'true');
    const geometry = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      loadVisible: document.querySelector('[data-testid="load"]')?.getBoundingClientRect().width ?? 0,
    }));
    if (geometry.scrollWidth > geometry.clientWidth + 1) {
      throw new Error(`responsive layout overflows by ${String(geometry.scrollWidth - geometry.clientWidth)}px`);
    }
    if (geometry.loadVisible <= 0) throw new Error('responsive Load control is not visible');
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  } finally {
    await context.close();
  }
  return {
    name: 'responsive-fresh-page',
    durationMs: round(performance.now() - started),
    failures,
  };
}

function captureFailures(page) {
  const failures = [];
  page.on('console', (message) => {
    if (message.type() === 'error') failures.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => failures.push(`page: ${error.message}`));
  page.on('requestfailed', (request) => {
    failures.push(`network: ${request.method()} ${request.url()} ${request.failure()?.errorText ?? ''}`);
  });
  return failures;
}

async function waitReady(page, timeout = 20_000) {
  await waitStatus(page, 'READY', timeout);
}

async function waitStatus(page, status, timeout = 20_000) {
  await page.getByTestId('status-badge').filter({ hasText: status }).waitFor({ timeout });
}

async function text(page, testId, property) {
  const locator = page.getByTestId(testId);
  if (property === 'value') return locator.inputValue();
  return (await locator.textContent())?.trim() ?? '';
}

async function canvasFingerprint(page) {
  return page.getByTestId('core-canvas').evaluate((canvas) => {
    const surface = /** @type {HTMLCanvasElement} */ (canvas);
    const context = surface.getContext('2d');
    if (context === null || surface.width === 0 || surface.height === 0) return 'empty';
    const points = [
      [0, 0],
      [Math.floor(surface.width / 2), Math.floor(surface.height / 2)],
      [Math.max(0, surface.width - 1), Math.max(0, surface.height - 1)],
      [Math.floor(surface.width / 4), Math.floor(surface.height / 4)],
    ];
    return points
      .map(([x, y]) => [...context.getImageData(x, y, 1, 1).data].join(','))
      .join('|');
  });
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, received ${actual}`);
}

function numberText(value) {
  return Number(value.replaceAll(',', ''));
}

function round(value) {
  return Math.round(value * 100) / 100;
}

async function startServer(serverPort) {
  const child = spawn(
    'npm',
    [
      'exec',
      'vite',
      '--',
      '--config',
      'vite.core-v1-lab.config.ts',
      '--host',
      '127.0.0.1',
      '--port',
      String(serverPort),
      '--strictPort',
    ],
    { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let output = '';
  child.stdout.on('data', (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    output += chunk.toString();
  });

  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Core v1 lab server exited early:\n${output}`);
    try {
      const response = await fetch(`${baseUrl}/lab/performance-v1/index.html`);
      if (response.ok) return child;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  child.kill('SIGTERM');
  throw new Error(`Timed out waiting for Core v1 lab server:\n${output}`);
}
