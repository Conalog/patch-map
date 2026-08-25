#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';

import { executeBenchmarkBrowserRun } from '../benchmark/browser-runner.mjs';
import { parseBenchmarkOptions } from '../benchmark/options.mjs';
import {
  MEASURED,
  SIZES,
  WARMUPS,
  assert,
} from '../benchmark/protocol.mjs';
import {
  hashText,
  summarizeBenchmark,
} from '../benchmark/report.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const RESULTS_ROOT = path.join(ROOT, '.artifacts/performance/benchmark');

async function main() {
  const options = parseBenchmarkOptions(process.argv, {
    root: ROOT,
    resultsRoot: RESULTS_ROOT,
  });
  const rawOutput = await executeBenchmarkBrowserRun(ROOT, options);
  const browserErrorCount =
    rawOutput.browser.consoleErrors.length
    + rawOutput.browser.pageErrors.length
    + rawOutput.browser.networkFailures.length;

  if (options.smoke) {
    const lifecycleFailures = rawOutput.runs
      .flatMap((run) => run.measuredRaw)
      .filter((trial) => (
        trial.diagnostics.lifecycleAfterDestroy !== 'destroyed'
        || trial.diagnostics.canvasCountAfterDestroy !== 0
        || trial.diagnostics.pendingWorkAfterDestroy !== 0
        || trial.diagnostics.subscriptionCountAfterDestroy !== 0
        || trial.diagnostics.surfaceChildCountAfterDestroy !== 0
      )).length;
    assert(browserErrorCount === 0, 'smoke browser errors');
    assert(lifecycleFailures === 0, 'smoke lifecycle cleanup');
    const smokeRun = rawOutput.runs[0];
    const smokeTrial = smokeRun?.measuredRaw[0];
    assert(smokeRun !== undefined && smokeTrial !== undefined, 'smoke measured trial');
    process.stdout.write(
      `[patch-map-benchmark] smoke metrics ${JSON.stringify({
        size: smokeRun.size,
        phases: smokeTrial.phases,
        visible: smokeTrial.visible,
        longTaskDurationsMs: smokeTrial.longTaskDurationsMs,
      })}\n`,
    );
    process.stdout.write(
      '[patch-map-benchmark] smoke passed; browser errors 0; lifecycle failures 0\n',
    );
    return;
  }

  const timestamp = rawOutput.generatedAt.replaceAll(':', '-').replaceAll('.', '-');
  const rawFilename = `benchmark-raw-${timestamp}.json`;
  const rawText = `${JSON.stringify(rawOutput, null, 2)}\n`;
  const rawDigest = hashText(rawText);
  await mkdir(options.resultsRoot, { recursive: true });
  await writeFile(path.join(options.resultsRoot, rawFilename), rawText);
  const summary = await summarizeBenchmark(rawOutput, {
    browserErrorCount,
    codeCommit: options.codeCommit,
    requestedHeaded: options.requestedHeaded,
    actualMode: options.headed ? 'headed' : 'headless',
    nativeWindows: options.nativeWindows,
  });
  summary.provenance.rawArtifactSha256 = rawDigest;
  summary.rawArtifact = {
    path: path.relative(ROOT, path.join(options.resultsRoot, rawFilename)),
    sha256: rawDigest,
    sampleCount: SIZES.length * MEASURED,
    warmupSampleCount: SIZES.length * WARMUPS,
  };
  await writeFile(
    path.join(options.resultsRoot, 'benchmark.json'),
    `${JSON.stringify(summary, null, 2)}\n`,
  );
  process.stdout.write(
    `[patch-map-benchmark] wrote ${rawFilename} (${rawDigest})\n`,
  );
  process.stdout.write(
    `[patch-map-benchmark] browser errors ${browserErrorCount}; `
      + `benchmark status ${summary.status}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
