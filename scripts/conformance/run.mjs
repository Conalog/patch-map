import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const harnessPath = '/scripts/conformance/harness.html';

const usage = `Usage: node scripts/conformance/run.mjs [options] [FIXTURE_ID ...]

Runs all approved fixtures when no fixture IDs are supplied.

Options:
  --repeat <count>   Run every selected fixture in <count> fresh sessions
  --headed           Launch headed Chromium
  --timeout <ms>     Navigation and fixture timeout (default: 30000)
  --help             Show this help

Examples:
  node scripts/conformance/run.mjs LIF-001 LIF-002
  node scripts/conformance/run.mjs --repeat 2
`;

const parsePositiveInteger = (value, option) => {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${option} requires a positive integer`);
  }
  return parsed;
};

const takeOptionValue = (args, index, name) => {
  const argument = args[index];
  const equalsPrefix = `${name}=`;
  if (argument.startsWith(equalsPrefix)) {
    return { value: argument.slice(equalsPrefix.length), consumed: 0 };
  }
  if (argument === name && args[index + 1] !== undefined) {
    return { value: args[index + 1], consumed: 1 };
  }
  throw new Error(`${name} requires a value`);
};

const parseArguments = (args) => {
  const options = {
    fixtureIds: [],
    headed: false,
    repeat: 1,
    timeout: 30_000,
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--help') {
      options.help = true;
    } else if (argument === '--headed') {
      options.headed = true;
    } else if (argument === '--repeat' || argument.startsWith('--repeat=')) {
      const { value, consumed } = takeOptionValue(args, index, '--repeat');
      options.repeat = parsePositiveInteger(value, '--repeat');
      index += consumed;
    } else if (argument === '--timeout' || argument.startsWith('--timeout=')) {
      const { value, consumed } = takeOptionValue(args, index, '--timeout');
      options.timeout = parsePositiveInteger(value, '--timeout');
      index += consumed;
    } else if (argument.startsWith('-')) {
      throw new Error(`Unknown option: ${argument}`);
    } else {
      options.fixtureIds.push(
        ...argument.split(',').map((id) => id.trim()).filter(Boolean),
      );
    }
  }

  return options;
};

const startHarnessServer = async () => {
  const server = await createServer({
    appType: 'spa',
    configFile: false,
    logLevel: 'error',
    root,
    server: {
      host: '127.0.0.1',
      port: 0,
      strictPort: false,
    },
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
};

const openHarnessPage = async (browser, url, timeout) => {
  const context = await browser.newContext({
    deviceScaleFactor: 1,
    viewport: { width: 1280, height: 720 },
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error));

  try {
    const response = await page.goto(url, { waitUntil: 'load', timeout });
    if (!response?.ok()) {
      throw new Error(`Harness request failed with status ${response?.status()}`);
    }
    await page.waitForFunction(
      () => Array.isArray(window.__PATCHMAP_CONFORMANCE__?.fixtureIds),
      undefined,
      { timeout },
    );
    if (pageErrors.length > 0) {
      throw new AggregateError(pageErrors, 'Harness emitted an uncaught page error');
    }
    return { context, page, pageErrors };
  } catch (error) {
    await context.close();
    throw error;
  }
};

const discoverFixtureIds = async (browser, url, timeout) => {
  const { context, page, pageErrors } = await openHarnessPage(
    browser,
    url,
    timeout,
  );
  try {
    const fixtureIds = await page.evaluate(
      () => [...window.__PATCHMAP_CONFORMANCE__.fixtureIds],
    );
    if (pageErrors.length > 0) {
      throw new AggregateError(pageErrors, 'Harness emitted an uncaught page error');
    }
    return fixtureIds;
  } finally {
    await context.close();
  }
};

const runFixtureInFreshSession = async (browser, url, fixtureId, timeout) => {
  const { context, page, pageErrors } = await openHarnessPage(
    browser,
    url,
    timeout,
  );
  page.setDefaultTimeout(timeout);

  try {
    const observed = await page.evaluate(({ id, timeoutMs }) => {
      let timeoutHandle;
      const timeoutPromise = new Promise((_, reject) => {
        timeoutHandle = setTimeout(
          () => reject(new Error(`Fixture timed out after ${timeoutMs}ms: ${id}`)),
          timeoutMs,
        );
      });
      return Promise.race([
        window.__PATCHMAP_CONFORMANCE__.runFixture(id),
        timeoutPromise,
      ]).finally(() => clearTimeout(timeoutHandle));
    }, { id: fixtureId, timeoutMs: timeout });
    if (pageErrors.length > 0) {
      throw new AggregateError(pageErrors, 'Fixture emitted an uncaught page error');
    }
    return observed;
  } finally {
    await context.close();
  }
};

const readExpectedObserved = async (fixtureId) => {
  const expectedPath = resolve(root, 'artifacts', 'expected', `${fixtureId}.json`);
  const document = JSON.parse(await readFile(expectedPath, 'utf8'));
  if (!Object.prototype.hasOwnProperty.call(document, 'observed')) {
    throw new Error(`Expected artifact has no observed payload: ${fixtureId}`);
  }
  return document.observed;
};

const jsonClone = (value) => JSON.parse(JSON.stringify(value));

const comparableObserved = (fixtureId, observed, approvedObserved = observed) => {
  const comparable = jsonClone(observed);

  if (
    fixtureId === 'INT-101' &&
    Array.isArray(comparable.trace) &&
    Array.isArray(approvedObserved?.trace)
  ) {
    // The approved v4 comparison contract leaves the authored headless drag
    // callbacks open. Project only that fixture boundary, plus the one matching
    // approved filter invocation used to build onDragStart's payload. Every
    // surrounding filter, target, event field and ordering observation remains
    // strict.
    const openDragCallbacks = new Set([
      'onDragStart',
      'onDrag',
      'onDragEnd',
    ]);
    const dragStart = comparable.trace.findIndex(
      (entry) => entry?.boundary === 'drag',
    );
    const dragEnd = comparable.trace.findIndex(
      (entry, index) => index > dragStart && entry?.boundary === 'drill-first',
    );
    const approvedDragStart = approvedObserved.trace.findIndex(
      (entry) => entry?.boundary === 'drag',
    );
    const approvedDragEnd = approvedObserved.trace.findIndex(
      (entry, index) =>
        index > approvedDragStart && entry?.boundary === 'drill-first',
    );
    const approvedFilterKeys = new Set(
      approvedObserved.trace
        .slice(approvedDragStart + 1, approvedDragEnd)
        .filter((entry) => entry?.filter)
        .map((entry) => JSON.stringify(entry)),
    );
    const openDragEntries = new Set();
    comparable.trace.forEach((entry, index) => {
      if (index <= dragStart || index >= dragEnd) return;
      if (!openDragCallbacks.has(entry?.callback)) return;
      openDragEntries.add(index);
      const prior = comparable.trace[index - 1];
      if (
        entry.callback === 'onDragStart' &&
        prior?.filter &&
        approvedFilterKeys.has(JSON.stringify(prior))
      ) {
        openDragEntries.add(index - 1);
      }
    });
    comparable.trace = comparable.trace.filter(
      (_entry, index) => !openDragEntries.has(index),
    );
  }

  if (fixtureId !== 'UPD-005') {
    return comparable;
  }

  // The approved policy marks only these rendered-pixel observations as
  // non-normative. All return-time state, scene, event, and frame-boundary
  // observations remain in the strict comparison.
  delete comparable.initialPixelDigest;
  if (comparable.nextFrame) {
    delete comparable.nextFrame.pixelDigest;
    delete comparable.nextFrame.differsFromInitialPixels;
  }
  return comparable;
};

const validateSelection = (requested, available) => {
  if (requested.length === 0) {
    return available;
  }

  const availableSet = new Set(available);
  const unknown = requested.filter((id) => !availableSet.has(id));
  if (unknown.length > 0) {
    throw new Error(`Unknown fixture ID(s): ${unknown.join(', ')}`);
  }
  return [...new Set(requested)];
};

const main = async () => {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage);
    return;
  }

  const { server, url } = await startHarnessServer();
  let browser;
  try {
    browser = await chromium.launch({ headless: !options.headed });
    const availableFixtureIds = await discoverFixtureIds(
      browser,
      url,
      options.timeout,
    );
    const selectedFixtureIds = validateSelection(
      options.fixtureIds,
      availableFixtureIds,
    );
    const expected = new Map(
      await Promise.all(
        selectedFixtureIds.map(async (fixtureId) => {
          const raw = await readExpectedObserved(fixtureId);
          return [fixtureId, {
            raw,
            comparable: comparableObserved(fixtureId, raw, raw),
          }];
        }),
      ),
    );
    const baselines = new Map();
    const failures = [];

    for (let run = 1; run <= options.repeat; run += 1) {
      for (const fixtureId of selectedFixtureIds) {
        const label = `${fixtureId} (${run}/${options.repeat})`;
        try {
          const observed = await runFixtureInFreshSession(
            browser,
            url,
            fixtureId,
            options.timeout,
          );
          const approved = expected.get(fixtureId);
          const actual = comparableObserved(
            fixtureId,
            observed,
            approved.raw,
          );
          assert.deepStrictEqual(actual, approved.comparable);
          const determinismActual = fixtureId === 'INT-101'
            ? observed
            : actual;
          if (baselines.has(fixtureId)) {
            assert.deepStrictEqual(
              determinismActual,
              baselines.get(fixtureId),
              `${fixtureId} changed across fresh sessions`,
            );
          } else {
            baselines.set(fixtureId, jsonClone(determinismActual));
          }
          process.stdout.write(`PASS ${label}\n`);
        } catch (error) {
          failures.push({ label, error });
          process.stderr.write(`FAIL ${label}\n${error.stack ?? error}\n`);
        }
      }
    }

    const total = selectedFixtureIds.length * options.repeat;
    process.stdout.write(
      `Conformance: ${total - failures.length}/${total} passed in fresh sessions\n`,
    );
    if (failures.length > 0) {
      process.exitCode = 1;
    }
  } finally {
    await browser?.close();
    await server.close();
  }
};

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
});
