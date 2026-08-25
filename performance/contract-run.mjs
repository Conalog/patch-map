#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';

import { executeContractBrowserRun } from './contract-run/browser-run.mjs';
import { parseContractRunOptions } from './contract-run/cli.mjs';
import {
  MEASURED,
  SIZES,
  WARMUPS,
  assert,
} from './contract-run/protocol.mjs';
import {
  hashText,
  summarizeEvidence,
} from './contract-run/report.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const RESULTS_ROOT = path.join(ROOT, '.artifacts/performance/contract');

async function main() {
  const options = parseContractRunOptions(process.argv, {
    root: ROOT,
    resultsRoot: RESULTS_ROOT,
  });
  const rawOutput = await executeContractBrowserRun(ROOT, options);
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
      `[patch-map-contract-perf] smoke metrics ${JSON.stringify({
        size: smokeRun.size,
        phases: smokeTrial.phases,
        visible: smokeTrial.visible,
        longTaskDurationsMs: smokeTrial.longTaskDurationsMs,
      })}\n`,
    );
    process.stdout.write(
      '[patch-map-contract-perf] smoke passed; browser errors 0; lifecycle failures 0\n',
    );
    return;
  }

  const timestamp = rawOutput.generatedAt.replaceAll(':', '-').replaceAll('.', '-');
  const rawFilename = `contract-performance-raw-${timestamp}.json`;
  const rawText = `${JSON.stringify(rawOutput, null, 2)}\n`;
  const rawDigest = hashText(rawText);
  await mkdir(options.resultsRoot, { recursive: true });
  await writeFile(path.join(options.resultsRoot, rawFilename), rawText);
  const summary = await summarizeEvidence(rawOutput, {
    browserErrorCount,
    codeCommit: options.codeCommit,
    requestedHeaded: options.requestedHeaded,
    actualMode: options.headed ? 'headed' : 'headless',
    nativeWindows: options.nativeWindows,
    packageEvidencePath: options.packageEvidencePath,
  });
  summary.provenance.rawArtifactSha256 = rawDigest;
  summary.rawArtifact = {
    path: path.relative(ROOT, path.join(options.resultsRoot, rawFilename)),
    sha256: rawDigest,
    sampleCount: SIZES.length * MEASURED,
    warmupSampleCount: SIZES.length * WARMUPS,
  };
  await writeFile(
    path.join(options.resultsRoot, 'contract-performance.json'),
    `${JSON.stringify(summary, null, 2)}\n`,
  );
  process.stdout.write(
    `[patch-map-contract-perf] wrote ${rawFilename} (${rawDigest})\n`,
  );
  process.stdout.write(
    `[patch-map-contract-perf] browser errors ${browserErrorCount}; `
      + `contract status ${summary.status}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
