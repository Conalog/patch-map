#!/usr/bin/env node

import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { chromium } from 'playwright';
import { createServer } from 'vite';

import { compareObservations } from './core-v2-main-parity/compare.mjs';
import { buildCoreV2MainParityContractMap } from './core-v2-main-parity/contract-map.mjs';
import { comparePngBuffers } from './core-v2-main-parity/image-metrics.mjs';
import { FIRST_PARITY_TRANCHE } from './core-v2-main-parity/scenarios.mjs';

const ROOT = process.cwd();
const MAIN_ROOT = path.resolve(
  process.env.PATCH_MAP_MAIN_ORACLE_ROOT
    ?? '/tmp/patch-map-main-parity-0aaaa98b',
);
const MAIN_ESM = path.join(MAIN_ROOT, 'dist/index.esm.js');
const PROFILE_PATH = path.join(
  ROOT,
  'docs/reference/core-v2-functional-contract/evidence/catalog-fixture-profiles.v1.json',
);
const CONTRACT_MANIFEST_PATH = path.join(
  ROOT,
  'docs/reference/core-v2-functional-contract/evidence/catalog-evidence-manifest.v1.json',
);
const TYPED_CASES_PATH = path.join(
  ROOT,
  'docs/reference/core-v2-functional-contract/evidence/catalog-typed-cases.v1.json',
);
const OUTPUT_ROOT = path.resolve(
  process.env.CORE_V2_MAIN_PARITY_OUTPUT
    ?? path.join(ROOT, 'docs/tasks/2026/07-29/core-v2-main-parity/artifacts/first-tranche'),
);
const mainSha = process.env.PATCH_MAP_MAIN_SHA ?? '0aaaa98b479c86939b049581734a7fb0745ba70e';
const coreSha = process.env.CORE_V2_CODE_COMMIT ?? 'working-tree';
const selectedIds = argumentValues(process.argv.slice(2), '--case');
const selectedScenarios = selectedIds.length === 0
  ? FIRST_PARITY_TRANCHE
  : FIRST_PARITY_TRANCHE.filter(({ id }) => selectedIds.includes(id));
if (selectedScenarios.length === 0) {
  throw new Error(`no first-tranche scenarios matched ${selectedIds.join(', ')}`);
}

const profiles = JSON.parse(await readFile(PROFILE_PATH, 'utf8'));
await mkdir(OUTPUT_ROOT, { recursive: true });
await clearOwnedArtifacts(OUTPUT_ROOT);

const server = await createServer({
  root: ROOT,
  configFile: false,
  publicDir: false,
  logLevel: 'error',
  resolve: {
    alias: {
      '@patch-map-main-oracle': MAIN_ESM,
    },
  },
  optimizeDeps: {
    exclude: ['@patch-map-main-oracle'],
  },
  server: {
    fs: {
      allow: [ROOT, MAIN_ROOT],
    },
  },
});

let browser = null;
const runtimeErrors = {
  main: { console: [], page: [], network: [] },
  coreV2: { console: [], page: [], network: [] },
};
const results = [];
try {
  await server.listen();
  const baseUrl = server.resolvedUrls?.local?.[0];
  if (!baseUrl) throw new Error('main parity Vite server has no local URL');
  browser = await chromium.launch({ headless: true });
  const mainContext = await browser.newContext({
    viewport: { width: 800, height: 600 },
    deviceScaleFactor: 1,
    reducedMotion: 'no-preference',
  });
  const coreContext = await browser.newContext({
    viewport: { width: 800, height: 600 },
    deviceScaleFactor: 1,
    reducedMotion: 'no-preference',
  });
  const mainPage = await mainContext.newPage();
  const corePage = await coreContext.newPage();
  bindErrors(mainPage, runtimeErrors.main);
  bindErrors(corePage, runtimeErrors.coreV2);
  await Promise.all([
    mainPage.goto(new URL('lab/main-parity/main.html', baseUrl).href, {
      waitUntil: 'networkidle',
    }),
    corePage.goto(new URL('lab/main-parity/core-v2.html', baseUrl).href, {
      waitUntil: 'networkidle',
    }),
  ]);
  await Promise.all([
    mainPage.waitForFunction(() => document.body.dataset.oracleReady === 'true'),
    corePage.waitForFunction(() => document.body.dataset.oracleReady === 'true'),
  ]);

  for (const scenario of selectedScenarios) {
    const dataset = scenario.input ?? profiles.datasets?.[scenario.dataset];
    if (dataset === undefined) {
      throw new Error(`${scenario.id} references missing profile dataset ${scenario.dataset}`);
    }
    const checkpoints = [];
    await invokeBoth(mainPage, corePage, 'initialize', [{ width: 800, height: 600, pixelRatio: 1 }]);
    const loaded = await invokeBoth(mainPage, corePage, 'load', [structuredClone(dataset)]);
    if (!invocationsFulfilled(loaded)) {
      checkpoints.push(rejectedCheckpoint(0, 'loaded', loaded));
      const destroyed = await invokeBoth(mainPage, corePage, 'destroy', []);
      const terminal = compareTerminalInvocations(destroyed);
      results.push(scenarioResult(scenario, checkpoints, terminal));
      continue;
    }
    checkpoints.push(await captureCheckpoint({
      scenario,
      index: 0,
      label: 'loaded',
      mainPage,
      corePage,
      main: loaded.main.value,
      core: loaded.core.value,
    }));
    let previousMain = loaded.main.value;
    let previousCore = loaded.core.value;
    let checkpointIndex = 1;
    for (const action of scenario.actions) {
      const observed = await performActionBoth(mainPage, corePage, action);
      if (!invocationsFulfilled(observed)) {
        checkpoints.push(rejectedCheckpoint(
          checkpointIndex,
          actionLabel(action, checkpointIndex),
          observed,
        ));
        break;
      }
      checkpoints.push(await captureCheckpoint({
        scenario,
        index: checkpointIndex,
        label: actionLabel(action, checkpointIndex),
        mainPage,
        corePage,
        main: observed.main.value,
        core: observed.core.value,
        action,
        previousMain,
        previousCore,
      }));
      previousMain = observed.main.value;
      previousCore = observed.core.value;
      checkpointIndex += 1;
    }
    const destroyed = await invokeBoth(mainPage, corePage, 'destroy', []);
    const terminal = compareTerminalInvocations(destroyed);
    results.push(scenarioResult(scenario, checkpoints, terminal));
  }
  await Promise.all([mainContext.close(), coreContext.close()]);
} finally {
  if (browser !== null) await browser.close();
  await server.close();
}

const contractMap = await buildCoreV2MainParityContractMap({
  manifestPath: CONTRACT_MANIFEST_PATH,
  typedCasesPath: TYPED_CASES_PATH,
  availableScenarioIds: FIRST_PARITY_TRANCHE.map(({ id }) => id),
});
await writeFile(
  path.join(OUTPUT_ROOT, 'contract-coverage.json'),
  `${JSON.stringify(contractMap, null, 2)}\n`,
);
const report = Object.freeze({
  schemaRevision: 'core-v2-main-parity/2026-07-29.1',
  generatedAt: new Date().toISOString(),
  boundary: Object.freeze({
    mainSha,
    coreSha,
    mainMode: 'read-only-black-box-public-runtime',
    expectedBlind: true,
    mainSourceInspected: false,
    rasterPolicy: 'semantic-first; antialiasing/glyph/subpixel-only variance tolerated',
  }),
  environment: Object.freeze({
    browser: 'playwright-chromium-headless',
    viewport: Object.freeze([800, 600]),
    deviceScaleFactor: 1,
    nativeWindows: 'pending',
  }),
  contractCoverage: Object.freeze({
    caseCount: contractMap.caseCount,
    mappedCaseCount: contractMap.mappedCaseCount,
    modeCounts: contractMap.modeCounts,
  }),
  summary: summarize(results, runtimeErrors),
  runtimeErrors: Object.freeze({
    main: freezeErrors(runtimeErrors.main),
    coreV2: freezeErrors(runtimeErrors.coreV2),
  }),
  results: Object.freeze(results),
});
await writeFile(
  path.join(OUTPUT_ROOT, 'report.json'),
  `${JSON.stringify(report, null, 2)}\n`,
);
console.log(JSON.stringify(report.summary, null, 2));
if (
  report.summary.blockingMismatchScenarioCount > 0 ||
  report.summary.runtimeErrorCount > 0
) {
  process.exitCode = 1;
}

async function clearOwnedArtifacts(outputRoot) {
  const entries = await readdir(outputRoot, { withFileTypes: true });
  await Promise.all(entries.flatMap((entry) => (
    entry.isFile() &&
    (
      /^[-\w]+-\d{2}-[-\w]+-(?:main|core-v2)\.png$/u.test(entry.name) ||
      entry.name === 'report.json' ||
      entry.name === 'contract-coverage.json'
    )
      ? [unlink(path.join(outputRoot, entry.name))]
      : []
  )));
}

async function invokeBoth(mainPage, corePage, method, args) {
  const [main, core] = await Promise.all([
    invokeOracle(mainPage, method, args),
    invokeOracle(corePage, method, args),
  ]);
  return Object.freeze({ main, core });
}

async function performActionBoth(mainPage, corePage, action) {
  if (action.type === 'browser-click') {
    const options = {
      button: action.button ?? 'left',
      clickCount: action.clickCount ?? 1,
    };
    await Promise.all([
      mainPage.mouse.click(action.x, action.y, options),
      corePage.mouse.click(action.x, action.y, options),
    ]);
    return invokeBoth(mainPage, corePage, 'act', [structuredClone(action)]);
  }
  if (action.type === 'browser-drag') {
    const steps = action.steps ?? 8;
    await Promise.all([
      dragMouse(mainPage, action, steps),
      dragMouse(corePage, action, steps),
    ]);
    return invokeBoth(mainPage, corePage, 'act', [structuredClone(action)]);
  }
  if (action.type === 'browser-wheel') {
    await Promise.all([
      wheelMouse(mainPage, action),
      wheelMouse(corePage, action),
    ]);
    return invokeBoth(mainPage, corePage, 'act', [structuredClone(action)]);
  }
  return invokeBoth(mainPage, corePage, 'act', [structuredClone(action)]);
}

async function dragMouse(page, action, steps) {
  await page.mouse.move(action.x, action.y);
  await page.mouse.down({ button: action.button ?? 'left' });
  await page.mouse.move(action.toX, action.toY, { steps });
  await page.mouse.up({ button: action.button ?? 'left' });
}

async function wheelMouse(page, action) {
  await page.mouse.move(action.x, action.y);
  await page.mouse.wheel(action.deltaX ?? 0, action.deltaY ?? 0);
}

function invokeOracle(page, method, args) {
  return page.evaluate(async ({ methodName, values }) => {
    try {
      const oracle = window.__PATCH_MAP_MAIN_PARITY__;
      if (!oracle) throw new Error('missing main parity oracle');
      return Object.freeze({
        status: 'fulfilled',
        value: await oracle[methodName](...values),
      });
    } catch (error) {
      return Object.freeze({
        status: 'rejected',
        error: error instanceof Error
          ? Object.freeze({ name: error.name, message: error.message })
          : Object.freeze({ name: 'Error', message: String(error) }),
      });
    }
  }, { methodName: method, values: args });
}

async function captureCheckpoint({
  scenario,
  index,
  label,
  mainPage,
  corePage,
  main,
  core,
  action = null,
  previousMain = null,
  previousCore = null,
}) {
  const prefix = `${scenario.id}-${String(index).padStart(2, '0')}-${safeName(label)}`;
  const [mainPng, corePng] = await Promise.all([
    mainPage.getByTestId('oracle-host').screenshot({
      path: path.join(OUTPUT_ROOT, `${prefix}-main.png`),
    }),
    corePage.getByTestId('oracle-host').screenshot({
      path: path.join(OUTPUT_ROOT, `${prefix}-core-v2.png`),
    }),
  ]);
  const image = comparePngBuffers(
    mainPng,
    corePng,
    entityComparisonRegions(main, core, scenario, label),
  );
  return Object.freeze({
    index,
    label,
    main,
    core,
    comparison: compareObservations(main, core, image, {
      compareViewport: scenario.compareViewport === true,
      checkpointLabel: label,
      acceptedDifferences: scenario.acceptedDifferences ?? [],
      transition: action === null || previousMain === null || previousCore === null
        ? null
        : Object.freeze({
            action,
            main: Object.freeze({ before: previousMain, after: main }),
            core: Object.freeze({ before: previousCore, after: core }),
          }),
    }),
    captures: Object.freeze({
      main: `${prefix}-main.png`,
      coreV2: `${prefix}-core-v2.png`,
    }),
  });
}

function entityComparisonRegions(main, core, scenario, checkpointLabel) {
  const selection = scenarioPixelRegions(scenario, checkpointLabel);
  if (selection.keys.size === 0 && selection.fixed.length === 0) {
    return Object.freeze([]);
  }
  const coreByKey = new Map(core.entities.map((entity) => [entityObservationKey(entity), entity]));
  const regions = [...selection.fixed];
  for (const mainEntity of main.entities) {
    const key = entityObservationKey(mainEntity);
    const coreEntity = coreByKey.get(key);
    if (
      coreEntity === undefined ||
      !selection.keys.has(key) ||
      mainEntity.bounds === null ||
      coreEntity.bounds === null
    ) {
      continue;
    }
    const left = Math.min(mainEntity.bounds[0], coreEntity.bounds[0]);
    const top = Math.min(mainEntity.bounds[1], coreEntity.bounds[1]);
    const right = Math.max(
      mainEntity.bounds[0] + mainEntity.bounds[2],
      coreEntity.bounds[0] + coreEntity.bounds[2],
    );
    const bottom = Math.max(
      mainEntity.bounds[1] + mainEntity.bounds[3],
      coreEntity.bounds[1] + coreEntity.bounds[3],
    );
    regions.push(Object.freeze({
      key,
      requestedType: mainEntity.requestedType,
      bounds: Object.freeze([left, top, right - left, bottom - top]),
    }));
  }
  return Object.freeze(regions);
}

function scenarioPixelRegions(scenario, checkpointLabel) {
  const keys = new Set();
  const fixed = [];
  for (const selector of scenario.pixelRegions ?? []) {
    if (!globMatches(selector.checkpoint ?? '*', checkpointLabel)) continue;
    for (const key of selector.keys ?? []) keys.add(key);
    for (const region of selector.fixed ?? []) {
      fixed.push(Object.freeze({
        key: region.key,
        requestedType: 'fixed-screen-region',
        bounds: Object.freeze([...region.bounds]),
      }));
    }
  }
  return Object.freeze({ keys, fixed: Object.freeze(fixed) });
}

function globMatches(pattern, value) {
  const expression = String(pattern)
    .split('*')
    .map((part) => part.replaceAll(/[\\^$.*+?()[\]{}|]/gu, '\\$&'))
    .join('.*');
  return new RegExp(`^${expression}$`, 'u').test(value);
}

function entityObservationKey(entity) {
  return entity.scope === 'component'
    ? `${entity.ownerId ?? 'unknown'}::${entity.id}`
    : entity.id;
}

function compareTerminal(main, core) {
  const findings = [];
  if (main.lifecycle !== 'destroyed' || core.lifecycle !== 'destroyed') {
    findings.push('both runtimes must publish destroyed lifecycle');
  }
  if (main.canvasCount !== 0 || core.canvasCount !== 0) {
    findings.push(`terminal canvas counts differ from zero: main=${main.canvasCount}, core=${core.canvasCount}`);
  }
  return Object.freeze({
    status: findings.length === 0 ? 'pass' : 'mismatch',
    findings: Object.freeze(findings),
    main,
    core,
  });
}

function compareTerminalInvocations(invocations) {
  if (!invocationsFulfilled(invocations)) {
    return Object.freeze({
      status: 'mismatch',
      findings: Object.freeze(['one or both runtimes rejected terminal destroy']),
      main: invocations.main,
      core: invocations.core,
    });
  }
  return compareTerminal(invocations.main.value, invocations.core.value);
}

function rejectedCheckpoint(index, label, invocations) {
  const mainRejected = invocations.main.status === 'rejected';
  const coreRejected = invocations.core.status === 'rejected';
  const status = !mainRejected && coreRejected
    ? 'mismatch'
    : 'not-comparable';
  const classification = mainRejected && !coreRejected
    ? 'main-rejected-approved-input'
    : mainRejected && coreRejected
      ? 'both-rejected'
      : 'core-v2-rejected-main-input';
  return Object.freeze({
    index,
    label,
    main: invocations.main,
    core: invocations.core,
    comparison: Object.freeze({
      status,
      mismatchCount: status === 'mismatch' ? 1 : 0,
      toleratedCount: 0,
      findings: Object.freeze([Object.freeze({
        classification,
        path: 'invocation',
        main: invocations.main,
        core: invocations.core,
        detail:
          classification === 'main-rejected-approved-input'
            ? 'main cannot serve as a visual oracle for this approved Core v2 input'
            : 'runtime invocation outcomes differ',
      })]),
      image: null,
    }),
    captures: null,
  });
}

function invocationsFulfilled(invocations) {
  return invocations.main.status === 'fulfilled'
    && invocations.core.status === 'fulfilled';
}

function scenarioResult(scenario, checkpoints, terminal) {
  const checkpointStatuses = checkpoints.map(({ comparison }) => comparison.status);
  const status = checkpointStatuses.includes('mismatch') || terminal.status === 'mismatch'
    ? 'mismatch'
    : checkpointStatuses.includes('not-comparable')
      ? 'not-comparable'
      : 'pass';
  return Object.freeze({
    id: scenario.id,
    title: scenario.title,
    dataset: scenario.dataset,
    gating: scenario.gating ?? scenario.id.startsWith('PAR-'),
    status,
    checkpoints: Object.freeze(checkpoints),
    terminal,
  });
}

function summarize(records, errors) {
  const mismatchScenarioCount = records.filter(({ status }) => status === 'mismatch').length;
  const blockingMismatchScenarioCount = records.filter(
    ({ status, gating }) => status === 'mismatch' && gating,
  ).length;
  const diagnosticMismatchScenarioCount =
    mismatchScenarioCount - blockingMismatchScenarioCount;
  const notComparableScenarioCount = records.filter(
    ({ status }) => status === 'not-comparable',
  ).length;
  const mismatchCheckpointCount = records.reduce(
    (total, record) => total
      + record.checkpoints.filter(({ comparison }) => comparison.status === 'mismatch').length
      + (record.terminal.status === 'mismatch' ? 1 : 0),
    0,
  );
  const runtimeErrorCount = Object.values(errors).reduce(
    (total, runtime) => total
      + runtime.console.length
      + runtime.page.length
      + runtime.network.length,
    0,
  );
  const acceptedDifferenceCount = records.reduce(
    (total, record) => total + record.checkpoints.reduce(
      (checkpointTotal, { comparison }) =>
        checkpointTotal + (comparison.acceptedDifferenceCount ?? 0),
      0,
    ),
    0,
  );
  return Object.freeze({
    scenarioCount: records.length,
    passedScenarioCount:
      records.length - mismatchScenarioCount - notComparableScenarioCount,
    mismatchScenarioCount,
    blockingMismatchScenarioCount,
    diagnosticMismatchScenarioCount,
    notComparableScenarioCount,
    checkpointCount: records.reduce((total, record) => total + record.checkpoints.length, 0),
    mismatchCheckpointCount,
    acceptedDifferenceCount,
    runtimeErrorCount,
    status:
      blockingMismatchScenarioCount === 0 && runtimeErrorCount === 0
        ? 'pass'
        : 'mismatch',
  });
}

function bindErrors(page, errors) {
  page.on('console', (message) => {
    if (message.type() === 'error') errors.console.push(message.text());
  });
  page.on('pageerror', (error) => errors.page.push(error.stack ?? error.message));
  page.on('requestfailed', (request) => {
    errors.network.push(`${request.url()} ${request.failure()?.errorText ?? ''}`.trim());
  });
  page.on('response', (response) => {
    if (response.status() >= 400) {
      errors.network.push(`${response.url()} HTTP ${response.status()}`);
    }
  });
}

function freezeErrors(errors) {
  return Object.freeze({
    console: Object.freeze([...errors.console]),
    page: Object.freeze([...errors.page]),
    network: Object.freeze([...errors.network]),
  });
}

function actionLabel(action, index) {
  if (action.type === 'world-transform') {
    const world = action.world;
    return `world-${world.rotationDegrees}-${world.flipX ? 'x' : 'n'}${world.flipY ? 'y' : 'n'}`;
  }
  if (action.type === 'resize') return `resize-${action.width}x${action.height}`;
  return `${action.type}-${index}`;
}

function argumentValues(argv, name) {
  const prefix = `${name}=`;
  const values = [];
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument.startsWith(prefix)) values.push(argument.slice(prefix.length));
    else if (argument === name && argv[index + 1]) values.push(argv[index + 1]);
  }
  return values;
}

function safeName(value) {
  return value.replaceAll(/[^a-z0-9-]+/giu, '-').replaceAll(/^-|-$/gu, '').toLowerCase();
}
