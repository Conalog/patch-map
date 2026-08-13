#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { chromium } from 'playwright';
import { createServer } from 'vite';

import {
  createPackedConsumerDependencySeedPackageJson,
  createPackedConsumerPackageJson,
  PACKED_CONSUMER_CJS_SOURCE,
  PACKED_CONSUMER_ESM_SOURCE,
  PACKED_CONSUMER_HTML_SOURCE,
} from './patch-map-package/consumer-sources.mjs';
import {
  collectPackageFailures,
  createPackageConsumerEvidence,
} from './patch-map-package/evidence.mjs';
import {
  createDependencyLicenseInventory,
  createSupplyChainEvidence,
  nonNegativeAuditCount,
} from './patch-map-package/supply-chain.mjs';
import {
  analyzePackedArtifact,
  auditPackedHostAdapter,
  comparePackedJourneys,
  createPackedProductAlias,
  preparePackedConsumerMatrix,
  readPackedBrowserResult,
  runPackedJourneyMatrix,
  verifyPackedConsumerTypes,
  verifyPackedProductionBuild,
} from './patch-map-package-matrix.mjs';

const execute = promisify(execFile);
const ROOT = process.cwd();
const temporary = await mkdtemp(path.join(tmpdir(), 'patch-map-package-'));
const RESULTS = path.resolve(
  process.env.PATCH_MAP_PACKAGE_ARTIFACT_DIR
    ?? path.join(temporary, 'results'),
);
const consumer = path.join(temporary, 'consumer');
const dependencySeed = path.join(temporary, 'dependency-seed');
const reproduciblePackDirectory = path.join(temporary, 'reproducible-pack');
const errors = { console: [], page: [], network: [] };
const requireAudit = process.argv.includes('--require-audit');
let server;
let browser;
let operationFailure;

try {
  await mkdir(consumer, { recursive: true });
  await mkdir(dependencySeed, { recursive: true });
  await mkdir(reproduciblePackDirectory, { recursive: true });
  const directImageDirectory = path.join(consumer, 'public', 'icons');
  await mkdir(directImageDirectory, { recursive: true });
  await writeFile(
    path.join(directImageDirectory, 'ess.svg'),
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#ef4444"/></svg>\n',
  );
  await writeFile(
    path.join(directImageDirectory, 'stick.svg'),
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#22c55e"/></svg>\n',
  );
  const packed = await execute(
    'npm',
    ['pack', '--ignore-scripts', '--json', '--pack-destination', temporary],
    {
      cwd: ROOT,
      maxBuffer: 10 * 1024 * 1024,
    },
  );
  const packResult = JSON.parse(packed.stdout);
  const packRecord = packResult[0];
  const filename = packRecord?.filename;
  if (typeof filename !== 'string') throw new Error('npm pack did not return a tarball filename');
  const tarball = path.join(temporary, filename);
  const packageArtifact = await analyzePackedArtifact({ packRecord, tarball });
  const secondPacked = await execute(
    'npm',
    ['pack', '--ignore-scripts', '--json', '--pack-destination', reproduciblePackDirectory],
    {
      cwd: ROOT,
      maxBuffer: 10 * 1024 * 1024,
    },
  );
  const secondPackRecord = JSON.parse(secondPacked.stdout)[0];
  const secondFilename = secondPackRecord?.filename;
  if (typeof secondFilename !== 'string') {
    throw new Error('second npm pack did not return a tarball filename');
  }
  const secondPackageArtifact = await analyzePackedArtifact({
    packRecord: secondPackRecord,
    tarball: path.join(reproduciblePackDirectory, secondFilename),
  });
  const hostAdapterAudit = await auditPackedHostAdapter(ROOT);
  const codeCommit = (
    await execute('git', ['rev-parse', 'HEAD'], {
      cwd: ROOT,
      maxBuffer: 1024 * 1024,
    })
  ).stdout.trim();
  const dependencyAudit = await auditDependencyLock(ROOT);
  const licenseInventory = await inventoryDependencyLicenses(ROOT);
  const supplyChain = createSupplyChainEvidence({
    codeCommit,
    first: packageArtifact,
    second: secondPackageArtifact,
    dependencyAudit,
    licenseInventory,
  });
  await writeFile(
    path.join(consumer, 'package.json'),
    createPackedConsumerPackageJson(tarball),
  );
  await writeFile(
    path.join(dependencySeed, 'package.json'),
    createPackedConsumerDependencySeedPackageJson(),
  );
  await preparePackedConsumerMatrix({
    root: ROOT,
    consumer,
    packageDigest: packageArtifact.sha256,
    codeCommit,
  });
  await writeFile(
    path.join(consumer, 'index.html'),
    PACKED_CONSUMER_HTML_SOURCE,
  );
  await writeFile(path.join(consumer, 'main.js'), PACKED_CONSUMER_ESM_SOURCE);
  await writeFile(path.join(consumer, 'consumer.cjs'), PACKED_CONSUMER_CJS_SOURCE);

  // A lockfile-driven root install can populate npm's tarball cache without
  // retaining the registry metadata npm needs to validate peers in a new
  // project. Seed only the public host dependencies, then keep the actual
  // packed-artifact consumer installation strictly offline.
  await execute('npm', [
    'install',
    '--prefer-offline',
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
  ], {
    cwd: dependencySeed,
    maxBuffer: 20 * 1024 * 1024,
  });
  await execute('npm', [
    'install',
    '--offline',
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
  ], {
    cwd: consumer,
    maxBuffer: 20 * 1024 * 1024,
  });
  const types = await verifyPackedConsumerTypes(consumer);
  const productionAlias = createPackedProductAlias({ root: ROOT, consumer });
  const productionBuild = await verifyPackedProductionBuild({
    consumer,
    outputDirectory: path.join(consumer, '.package-build'),
    aliasPlugin: productionAlias.plugin,
  });
  const productionAliasProbe = productionAlias.probe();
  const cjs = JSON.parse((await execute('node', ['consumer.cjs'], { cwd: consumer })).stdout);
  const browserAlias = createPackedProductAlias({ root: ROOT, consumer });
  server = await createServer({
    root: consumer,
    configFile: false,
    logLevel: 'error',
    plugins: [browserAlias.plugin],
    server: {
      host: '127.0.0.1',
      port: 0,
      fs: {
        allow: [ROOT, consumer],
      },
    },
  });
  await server.listen();
  const baseUrl = server.resolvedUrls?.local?.[0];
  if (!baseUrl) throw new Error('package consumer Vite server has no URL');
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
  page.on('console', (message) => {
    if (
      message.type() === 'error' ||
      (message.type() === 'warning' && message.text().includes('[Assets] Asset id'))
    ) errors.console.push(`${message.type()}: ${message.text()}`);
  });
  page.on('pageerror', (error) => {
    errors.page.push(error.stack || `${error.name}: ${error.message}`);
  });
  page.on('requestfailed', (request) => errors.network.push(`${request.url()} ${request.failure()?.errorText ?? ''}`));
  page.on('response', (response) => {
    if (response.status() >= 400) errors.network.push(`${response.url()} HTTP ${response.status()}`);
  });
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await runPackedPointerInteractionProbe(page);
  try {
    await page.waitForFunction(() => window.__PACKAGE_RESULT__ !== undefined, undefined, {
      timeout: 30_000,
    });
  } catch (error) {
    const browserState = await page.evaluate(() => ({
      readyState: document.readyState,
      resultPublished: window.__PACKAGE_RESULT__ !== undefined,
      bodyText: document.body.textContent?.slice(0, 500) ?? '',
    }));
    throw new Error(
      `packed consumer result timeout: ${error instanceof Error ? error.message : String(error)}; ` +
      `browserState=${JSON.stringify(browserState)}; errors=${JSON.stringify(errors)}`,
    );
  }
  const esm = await page.evaluate(() => window.__PACKAGE_RESULT__);
  const examples = await readPackedBrowserResult(
    page,
    baseUrl,
    'examples.html',
    '__PATCH_MAP_PACKAGE_EXAMPLES__',
    60_000,
  );
  const packageMatrix = await readPackedBrowserResult(
    page,
    baseUrl,
    'matrix.html',
    '__PATCH_MAP_PACKAGE_MATRIX__',
    60_000,
  );
  let journeyBrowser;
  try {
    journeyBrowser = await runPackedJourneyMatrix(page, baseUrl);
  } catch (error) {
    const journeyState = await page.evaluate(() => ({
      readyState: document.readyState,
      bodyText: document.body.textContent?.slice(0, 500) ?? '',
      runnerPublished:
        window.__PATCH_MAP_PACKAGE_JOURNEY_RUNNER__ !== undefined,
    }));
    throw new Error(
      `packed journey harness failed: ${
        error instanceof Error ? error.message : String(error)
      }; state=${JSON.stringify(journeyState)}; errors=${JSON.stringify(errors)}`,
      { cause: error },
    );
  }
  const journeyMatrix = await comparePackedJourneys({
    root: ROOT,
    browserResult: journeyBrowser,
    packageDigest: packageArtifact.sha256,
  });
  const browserAliasProbe = browserAlias.probe();
  const failures = collectPackageFailures({
    cjs,
    errors,
    esm,
    examples,
    hostAdapterAudit,
    journeyBrowser,
    journeyMatrix,
    packageArtifact,
    packageMatrix,
    productionAliasProbe,
    productionBuild,
    supplyChain,
    types,
  });

  const generatedAt = new Date().toISOString();
  const evidence = createPackageConsumerEvidence({
    generatedAt,
    browserAliasProbe,
    browserVersion: browser.version(),
    cjs,
    codeCommit,
    dependencyAudit,
    errors,
    esm,
    examples,
    failures,
    hostAdapterAudit,
    journeyMatrix,
    licenseInventory,
    packageArtifact,
    packageMatrix,
    productionAliasProbe,
    productionBuild,
    supplyChain,
    types,
  });
  await mkdir(RESULTS, { recursive: true });
  await writeFile(path.join(RESULTS, 'package-consumer.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  if (failures.length) {
    process.stderr.write(`${JSON.stringify({
      builtins: esm.builtins,
      pointerInteraction: esm.pointerInteraction,
      selectionBoundsDisplay: esm.selectionBoundsDisplay,
      journey: {
        browserRemainingCanvasCount: journeyBrowser.remainingCanvasCount,
        journeyCount: journeyMatrix.journeyCount,
        passedJourneyCount: journeyMatrix.passedJourneyCount,
        failedJourneyCount: journeyMatrix.failedJourneyCount,
        packageDigestAcrossJourneys: journeyMatrix.packageDigestAcrossJourneys,
        packageDigest: packageArtifact.sha256,
        cleanupFailureCount: journeyMatrix.cleanupFailureCount,
      },
    }, null, 2)}\n`);
    throw new Error(failures.join('; '));
  }
  if (requireAudit && evidence.status !== 'pass') {
    throw new Error(`packed dependency audit is required, received ${evidence.status}`);
  }
  process.stdout.write(
    `${evidence.status === 'pass' ? 'PASS' : 'PENDING'}: packed PatchMap ESM/CJS/types + `
      + `${journeyMatrix.passedJourneyCount} journeys, `
    + `${examples.executedExamples.length} examples, ${esm.renderObjects} aggregate objects, `
    + 'direct-image capture ready, lifecycle clean\n',
  );
} catch (error) {
  operationFailure = error;
}

const cleanup = await Promise.allSettled([
  browser?.close(),
  server?.close(),
  rm(temporary, { recursive: true, force: true }),
]);
const cleanupFailures = cleanup
  .filter((result) => result.status === 'rejected')
  .map((result) => result.reason);
if (operationFailure !== undefined && cleanupFailures.length > 0) {
  throw new AggregateError(
    [operationFailure, ...cleanupFailures],
    'packed consumer verification and cleanup both failed',
  );
}
if (operationFailure !== undefined) throw operationFailure;
if (cleanupFailures.length > 0) {
  throw new AggregateError(cleanupFailures, 'packed consumer cleanup failed');
}

async function runPackedPointerInteractionProbe(page) {
  try {
    await page.waitForFunction(
      () => window.__PATCH_MAP_POINTER_PROBE__?.phase === 'first',
      undefined,
      { timeout: 120_000 },
    );
  } catch (error) {
    const browserState = await page.evaluate(() => ({
      readyState: document.readyState,
      pointerPhase: window.__PATCH_MAP_POINTER_PROBE__?.phase ?? null,
      resultPublished: window.__PACKAGE_RESULT__ !== undefined,
      bodyText: document.body.textContent?.slice(0, 500) ?? '',
    }));
    throw new Error(
      `packed pointer probe startup timeout: ${
        error instanceof Error ? error.message : String(error)
      }; browserState=${JSON.stringify(browserState)}; errors=${JSON.stringify(errors)}`,
    );
  }
  const bounds = await page.locator('#packed-pointer-host').boundingBox();
  if (!bounds) throw new Error('packed pointer interaction host has no bounds');
  const move = (x, y, steps = 1) => page.mouse.move(bounds.x + x, bounds.y + y, { steps });
  const record = (label) => page.evaluate(
    (value) => window.__PATCH_MAP_POINTER_PROBE__.record(value),
    label,
  );

  await move(45, 45);
  await move(48, 48);
  await move(225, 140);
  await move(45, 45);
  await page.mouse.click(bounds.x + 45, bounds.y + 45);
  const clickRed = await page.evaluate(
    () => window.__PATCH_MAP_POINTER_PROBE__.captureRed(),
  );
  await page.evaluate((value) => {
    window.__PATCH_MAP_POINTER_PROBE__.clickRed = value;
  }, clickRed);
  await page.keyboard.down('Shift');
  await page.mouse.click(bounds.x + 95, bounds.y + 45);
  await page.keyboard.up('Shift');
  await page.mouse.click(bounds.x + 145, bounds.y + 45);

  await page.evaluate(() => window.__PATCH_MAP_POINTER_PROBE__.clearSelection());
  await record('plainPanBefore');
  await move(190, 125);
  await page.mouse.down();
  await move(210, 140);
  await page.mouse.up();
  await record('plainPanAfter');

  await record('lateShiftPanBefore');
  await move(190, 125);
  await page.mouse.down();
  await move(195, 130);
  await page.keyboard.down('Shift');
  await move(210, 145);
  await page.keyboard.up('Shift');
  await page.mouse.up();
  await record('lateShiftPanAfter');

  await record('wheelBefore');
  await move(200, 130);
  await page.mouse.wheel(0, -120);
  await record('wheelAfter');

  await record('middlePanBefore');
  await move(190, 125);
  await page.mouse.down({ button: 'middle' });
  await move(200, 135);
  await page.mouse.up({ button: 'middle' });
  await record('middlePanAfter');

  await record('boxViewportBefore');
  await move(5, 5);
  await page.keyboard.down('Shift');
  await page.mouse.down();
  const captureDuring = await page.evaluate(() => {
    const probe = window.__PATCH_MAP_POINTER_PROBE__;
    const canvas = document.querySelector('#packed-pointer-host canvas');
    return canvas?.hasPointerCapture(probe?.lastPointerId ?? -1) ?? false;
  });
  await move(230, 150, 5);
  const marqueeDuring = await page.evaluate(
    () => window.__PATCH_MAP_POINTER_PROBE__.captureRed(),
  );
  await page.keyboard.up('Shift');
  await page.mouse.up();
  const captureAfter = await page.evaluate(() => {
    const probe = window.__PATCH_MAP_POINTER_PROBE__;
    const canvas = document.querySelector('#packed-pointer-host canvas');
    return canvas?.hasPointerCapture(probe?.lastPointerId ?? -1) ?? false;
  });
  await page.evaluate(({ captureDuring, captureAfter }) => {
    const probe = window.__PATCH_MAP_POINTER_PROBE__;
    probe.captureDuring = captureDuring;
    probe.captureAfter = captureAfter;
  }, { captureDuring, captureAfter });
  await record('boxViewportAfter');
  await page.evaluate(() => window.__PATCH_MAP_POINTER_PROBE__.clearSelection());
  const marqueeAfter = await page.evaluate(
    () => window.__PATCH_MAP_POINTER_PROBE__.captureRed(),
  );
  await page.evaluate(({ marqueeDuring, marqueeAfter }) => {
    const probe = window.__PATCH_MAP_POINTER_PROBE__;
    probe.marqueeDuring = marqueeDuring;
    probe.marqueeAfter = marqueeAfter;
  }, { marqueeDuring, marqueeAfter });
  await page.evaluate(() => window.__PATCH_MAP_POINTER_PROBE__.markPostViewportHover());
  await move(75, 80);
  await page.evaluate(() => window.__PATCH_MAP_POINTER_PROBE__.finishFirst());
  await page.waitForFunction(
    () => window.__PATCH_MAP_POINTER_PROBE__?.phase === 'remount',
    undefined,
    { timeout: 30_000 },
  );

  await move(225, 140);
  await move(45, 45);
  await move(5, 5);
  await page.keyboard.down('Shift');
  await page.mouse.down();
  const remountCaptureDuring = await page.evaluate(() => {
    const probe = window.__PATCH_MAP_POINTER_PROBE__;
    const canvas = document.querySelector('#packed-pointer-host canvas');
    return canvas?.hasPointerCapture(probe?.lastPointerId ?? -1) ?? false;
  });
  await move(280, 190, 5);
  const remountMarqueeDuring = await page.evaluate(
    () => window.__PATCH_MAP_POINTER_PROBE__.captureRed(),
  );
  await page.keyboard.up('Shift');
  await page.mouse.up();
  const remountCaptureAfter = await page.evaluate(() => {
    const probe = window.__PATCH_MAP_POINTER_PROBE__;
    const canvas = document.querySelector('#packed-pointer-host canvas');
    return canvas?.hasPointerCapture(probe?.lastPointerId ?? -1) ?? false;
  });
  await page.evaluate(({ remountCaptureDuring, remountCaptureAfter }) => {
    const probe = window.__PATCH_MAP_POINTER_PROBE__;
    probe.remountCaptureDuring = remountCaptureDuring;
    probe.remountCaptureAfter = remountCaptureAfter;
  }, { remountCaptureDuring, remountCaptureAfter });
  await page.evaluate(() => window.__PATCH_MAP_POINTER_PROBE__.clearSelection());
  const remountMarqueeAfter = await page.evaluate(
    () => window.__PATCH_MAP_POINTER_PROBE__.captureRed(),
  );
  await page.evaluate(({ remountMarqueeDuring, remountMarqueeAfter }) => {
    const probe = window.__PATCH_MAP_POINTER_PROBE__;
    probe.remountMarqueeDuring = remountMarqueeDuring;
    probe.remountMarqueeAfter = remountMarqueeAfter;
  }, { remountMarqueeDuring, remountMarqueeAfter });
  await page.evaluate(() => window.__PATCH_MAP_POINTER_PROBE__.finishRemount());
}

async function auditDependencyLock(root) {
  if (process.env.PATCH_MAP_SKIP_NETWORK_AUDIT === '1') {
    return Object.freeze({
      status: 'pending-external-network',
      auditLevel: 'low',
      exitCode: null,
      knownVulnerabilityCount: null,
      severityCounts: null,
    });
  }
  let stdout = '';
  let exitCode = 0;
  try {
    const result = await execute(
      'npm',
      ['audit', '--package-lock-only', '--json', '--audit-level=low'],
      {
        cwd: root,
        maxBuffer: 10 * 1024 * 1024,
      },
    );
    stdout = result.stdout;
  } catch (error) {
    exitCode = Number.isSafeInteger(error?.code) ? error.code : 1;
    stdout = typeof error?.stdout === 'string'
      ? error.stdout
      : error?.stdout?.toString?.() ?? '';
  }
  if (stdout.length === 0) {
    throw new Error('npm audit produced no JSON result');
  }
  const parsed = JSON.parse(stdout);
  if (parsed.error !== undefined) {
    throw new Error(`npm audit failed: ${JSON.stringify(parsed.error)}`);
  }
  const vulnerabilities = parsed.metadata?.vulnerabilities ?? {};
  const severityCounts = Object.freeze({
    info: nonNegativeAuditCount(vulnerabilities.info),
    low: nonNegativeAuditCount(vulnerabilities.low),
    moderate: nonNegativeAuditCount(vulnerabilities.moderate),
    high: nonNegativeAuditCount(vulnerabilities.high),
    critical: nonNegativeAuditCount(vulnerabilities.critical),
  });
  const total = nonNegativeAuditCount(vulnerabilities.total);
  if (total !== Object.values(severityCounts).reduce((sum, count) => sum + count, 0)) {
    throw new Error('npm audit vulnerability total does not match severity counts');
  }
  return Object.freeze({
    status: 'observed',
    auditLevel: 'low',
    exitCode,
    knownVulnerabilityCount: nonNegativeAuditCount(total),
    severityCounts,
  });
}

async function inventoryDependencyLicenses(root) {
  const lock = JSON.parse(await readFile(path.join(root, 'package-lock.json'), 'utf8'));
  return createDependencyLicenseInventory(lock);
}
