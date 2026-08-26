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
} from './consumer-sources.mjs';
import { collectPackageFailures, createPackageConsumerEvidence } from './evidence.mjs';
import {
  analyzePackedArtifact,
  createPackedProductAlias,
  preparePackedConsumer,
  readPackedBrowserResult,
  verifyPackedConsumerTypes,
  verifyPackedProductionBuild,
} from './harness.mjs';
import {
  createDependencyLicenseInventory,
  createSupplyChainEvidence,
  nonNegativeAuditCount,
} from './supply-chain.mjs';

const execute = promisify(execFile);
const root = process.cwd();
const temporary = await mkdtemp(path.join(tmpdir(), 'patch-map-package-'));
const resultsDirectory = path.resolve(
  process.env.PATCH_MAP_PACKAGE_ARTIFACT_DIR ?? path.join(temporary, 'results'),
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
  await Promise.all([
    mkdir(consumer, { recursive: true }),
    mkdir(dependencySeed, { recursive: true }),
    mkdir(reproduciblePackDirectory, { recursive: true }),
  ]);
  const firstPack = await pack(root, temporary);
  const secondPack = await pack(root, reproduciblePackDirectory);
  const packageArtifact = await analyzePackedArtifact({
    packRecord: firstPack.record,
    tarball: firstPack.tarball,
  });
  const secondPackageArtifact = await analyzePackedArtifact({
    packRecord: secondPack.record,
    tarball: secondPack.tarball,
  });
  const codeCommit = (
    await execute('git', ['rev-parse', 'HEAD'], { cwd: root, maxBuffer: 1024 * 1024 })
  ).stdout.trim();
  const dependencyAudit = await auditDependencyLock(root);
  const licenseInventory = createDependencyLicenseInventory(
    JSON.parse(await readFile(path.join(root, 'package-lock.json'), 'utf8')),
  );
  const supplyChain = createSupplyChainEvidence({
    codeCommit,
    first: packageArtifact,
    second: secondPackageArtifact,
    dependencyAudit,
    licenseInventory,
  });

  await writeFile(
    path.join(consumer, 'package.json'),
    createPackedConsumerPackageJson(firstPack.tarball),
  );
  await writeFile(
    path.join(dependencySeed, 'package.json'),
    createPackedConsumerDependencySeedPackageJson(),
  );
  await preparePackedConsumer({ root, consumer });
  await Promise.all([
    writeFile(path.join(consumer, 'index.html'), PACKED_CONSUMER_HTML_SOURCE),
    writeFile(path.join(consumer, 'main.js'), PACKED_CONSUMER_ESM_SOURCE),
    writeFile(path.join(consumer, 'consumer.cjs'), PACKED_CONSUMER_CJS_SOURCE),
  ]);

  // Seed npm's metadata cache, then prove the tarball installs without network access.
  await installDependencies(dependencySeed, false);
  await installDependencies(consumer, true);

  const types = await verifyPackedConsumerTypes(consumer);
  const productionAlias = createPackedProductAlias({ root, consumer });
  const productionBuild = await verifyPackedProductionBuild({
    consumer,
    outputDirectory: path.join(consumer, '.package-build'),
    aliasPlugin: productionAlias.plugin,
  });
  const productionAliasProbe = productionAlias.probe();
  const cjs = JSON.parse((await execute('node', ['consumer.cjs'], { cwd: consumer })).stdout);

  const browserAlias = createPackedProductAlias({ root, consumer });
  server = await createServer({
    root: consumer,
    configFile: false,
    logLevel: 'error',
    plugins: [browserAlias.plugin],
    server: {
      host: '127.0.0.1',
      port: 0,
      fs: { allow: [root, consumer] },
    },
  });
  await server.listen();
  const baseUrl = server.resolvedUrls?.local?.[0];
  if (!baseUrl) throw new Error('package consumer Vite server has no URL');
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
  observeBrowserErrors(page, errors);
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__PACKAGE_POINTER_OWNERSHIP__ !== undefined, undefined, {
    timeout: 30_000,
  });
  await page.mouse.move(90, 80);
  const overlayHoverTargets = await page.evaluate(
    () => window.__PACKAGE_POINTER_OWNERSHIP__.hoverTargets(),
  );
  await page.evaluate(() => {
    document.querySelector('#host-overlay').hidden = true;
  });
  await page.mouse.move(20, 200);
  const overlayDragBefore = await page.evaluate(
    () => window.__PACKAGE_POINTER_OWNERSHIP__.viewport(),
  );
  await page.mouse.move(250, 200);
  await page.mouse.down({ button: 'left' });
  await page.evaluate(() => {
    const overlay = document.querySelector('#host-overlay');
    overlay.style.left = '240px';
    overlay.style.top = '190px';
    overlay.hidden = false;
  });
  await page.mouse.move(270, 220);
  await page.mouse.up({ button: 'left' });
  const overlayDragAfter = await page.evaluate(
    () => window.__PACKAGE_POINTER_OWNERSHIP__.viewport(),
  );
  await page.evaluate(async (pointerOwnership) => {
    document.querySelector('#host-overlay').hidden = true;
    await window.__PACKAGE_POINTER_OWNERSHIP__.finalize(pointerOwnership);
  }, {
    overlayHoverIgnored: overlayHoverTargets.length === 0,
    overlayDragContinued: JSON.stringify(overlayDragAfter) !== JSON.stringify(overlayDragBefore),
  });
  await page.waitForFunction(() => window.__PACKAGE_RESULT__ !== undefined, undefined, {
    timeout: 30_000,
  });
  const esm = await page.evaluate(() => window.__PACKAGE_RESULT__);
  const examples = await readPackedBrowserResult(
    page,
    baseUrl,
    'examples.html',
    '__PATCH_MAP_PACKAGE_EXAMPLES__',
    60_000,
  );
  const browserAliasProbe = browserAlias.probe();
  const failures = collectPackageFailures({
    cjs,
    errors,
    esm,
    examples,
    packageArtifact,
    productionAliasProbe,
    productionBuild,
    supplyChain,
    types,
  });
  const evidence = createPackageConsumerEvidence({
    generatedAt: new Date().toISOString(),
    browserAliasProbe,
    browserVersion: browser.version(),
    cjs,
    codeCommit,
    errors,
    esm,
    examples,
    failures,
    packageArtifact,
    productionAliasProbe,
    productionBuild,
    supplyChain,
    types,
  });
  await mkdir(resultsDirectory, { recursive: true });
  await writeFile(
    path.join(resultsDirectory, 'package-consumer.json'),
    `${JSON.stringify(evidence, null, 2)}\n`,
  );
  if (failures.length) throw new Error(failures.join('; '));
  if (requireAudit && evidence.status !== 'pass') {
    throw new Error(`packed dependency audit is required, received ${evidence.status}`);
  }
  process.stdout.write(
    `${evidence.status === 'pass' ? 'PASS' : 'PENDING'}: packed PatchMap ESM/CJS/types + `
    + `${examples.executedExamples.length} examples, capture ready, lifecycle clean\n`,
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

async function pack(directory, destination) {
  const result = await execute(
    'npm',
    ['pack', '--ignore-scripts', '--json', '--pack-destination', destination],
    { cwd: directory, maxBuffer: 10 * 1024 * 1024 },
  );
  const record = JSON.parse(result.stdout)[0];
  if (typeof record?.filename !== 'string') {
    throw new Error('npm pack did not return a tarball filename');
  }
  return { record, tarball: path.join(destination, record.filename) };
}

async function installDependencies(directory, offline) {
  await execute('npm', [
    'install',
    offline ? '--offline' : '--prefer-offline',
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
  ], { cwd: directory, maxBuffer: 20 * 1024 * 1024 });
}

function observeBrowserErrors(page, observed) {
  page.on('console', (message) => {
    if (message.type() === 'error') observed.console.push(message.text());
  });
  page.on('pageerror', (error) => observed.page.push(error.stack || error.message));
  page.on('requestfailed', (request) => {
    observed.network.push(`${request.url()} ${request.failure()?.errorText ?? ''}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400) {
      observed.network.push(`${response.url()} HTTP ${response.status()}`);
    }
  });
}

async function auditDependencyLock(directory) {
  if (process.env.PATCH_MAP_SKIP_NETWORK_AUDIT === '1') {
    return Object.freeze({
      status: 'pending-external-network',
      auditLevel: 'low',
      knownVulnerabilityCount: null,
      severityCounts: null,
    });
  }
  let stdout;
  try {
    stdout = (await execute(
      'npm',
      ['audit', '--package-lock-only', '--json', '--audit-level=low'],
      { cwd: directory, maxBuffer: 10 * 1024 * 1024 },
    )).stdout;
  } catch (error) {
    stdout = typeof error?.stdout === 'string'
      ? error.stdout
      : error?.stdout?.toString?.() ?? '';
  }
  if (stdout.length === 0) throw new Error('npm audit produced no JSON result');
  const parsed = JSON.parse(stdout);
  if (parsed.error !== undefined) {
    throw new Error(`npm audit failed: ${JSON.stringify(parsed.error)}`);
  }
  const vulnerabilities = parsed.metadata?.vulnerabilities ?? {};
  const severityCounts = Object.freeze(Object.fromEntries(
    ['info', 'low', 'moderate', 'high', 'critical']
      .map((severity) => [severity, nonNegativeAuditCount(vulnerabilities[severity])]),
  ));
  const total = nonNegativeAuditCount(vulnerabilities.total);
  if (total !== Object.values(severityCounts).reduce((sum, count) => sum + count, 0)) {
    throw new Error('npm audit vulnerability total does not match severity counts');
  }
  return Object.freeze({
    status: 'observed',
    auditLevel: 'low',
    knownVulnerabilityCount: total,
    severityCounts,
  });
}
