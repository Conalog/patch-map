#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const packageEvidence = JSON.parse(
  await readFile(
    path.join(ROOT, 'performance/core-v2/results/package-consumer.json'),
    'utf8',
  ),
);
const CANDIDATE_COMMIT = packageEvidence?.provenance?.codeCommit;
if (
  typeof CANDIDATE_COMMIT !== 'string'
  || !/^[a-f0-9]{40}$/u.test(CANDIDATE_COMMIT)
) {
  throw new Error('packed consumer evidence must expose a 40-character implementation commit');
}
const TEMP_RELATIVE = path.join(
  'performance/core-v2/results',
  `.native-release-probes-${process.pid}`,
);
const TEMP = path.join(ROOT, TEMP_RELATIVE);
const TEMPLATE_RELATIVE = path.join(TEMP_RELATIVE, 'template.json');
const MANIFEST_RELATIVE = path.join(TEMP_RELATIVE, 'manifest.json');
const REPORT_RELATIVE = path.join(TEMP_RELATIVE, 'report.json');
const GENERATOR = path.join(
  ROOT,
  'scripts/verification/core-v2-native-release-template.mjs',
);
const VERIFIER = path.join(
  ROOT,
  'scripts/verification/core-v2-release-readiness.mjs',
);

try {
  await mkdir(TEMP, { recursive: true });
  const generated = spawnSync(
    process.execPath,
    [GENERATOR, `--output=${TEMPLATE_RELATIVE}`, `--commit=${CANDIDATE_COMMIT}`],
    {
      cwd: ROOT,
      encoding: 'utf8',
    },
  );
  assertExit(generated, 0, 'native release template generation');
  const template = JSON.parse(
    await readFile(path.join(ROOT, TEMPLATE_RELATIVE), 'utf8'),
  );
  const validManifest = await completeManifest(template);
  await writeManifest(validManifest);
  const validRun = runVerifier();
  assertExit(validRun, 0, 'complete native release manifest');
  const validReport = JSON.parse(
    await readFile(path.join(ROOT, REPORT_RELATIVE), 'utf8'),
  );
  if (
    validReport.status !== 'release-verified'
    || validReport.releaseVerified !== true
  ) {
    throw new Error('complete native release manifest did not promote');
  }

  const localDriftRun = runVerifier('b'.repeat(40));
  if (localDriftRun.status === 0) {
    throw new Error('local implementation commit drift unexpectedly promoted');
  }
  const localDriftReport = JSON.parse(
    await readFile(path.join(ROOT, REPORT_RELATIVE), 'utf8'),
  );
  if (
    !localDriftReport.localCandidate?.failures?.includes(
      'browser-functional:code-commit',
    )
  ) {
    throw new Error('local implementation commit drift was not reported');
  }

  const probes = [
    {
      name: 'missing browser cell',
      expectedFailure: 'exact eight-cell browser matrix',
      mutate: (manifest) => {
        manifest.browserCells.pop();
      },
    },
    {
      name: 'duplicate browser cell',
      expectedFailure: 'no duplicate or extra browser cells',
      mutate: (manifest) => {
        manifest.browserCells[7].id = manifest.browserCells[6].id;
      },
    },
    {
      name: 'headless runtime',
      expectedFailure: 'headed',
      mutate: (manifest) => {
        manifest.browserCells[0].runtime.headed = false;
      },
    },
    {
      name: 'WebGPU production substitution',
      expectedFailure: 'mandatory WebGL2 backend',
      mutate: (manifest) => {
        manifest.browserCells[0].runtime.backend = 'webgpu';
      },
    },
    {
      name: 'placeholder CSP',
      expectedFailure: 'CSP profile',
      mutate: (manifest) => {
        manifest.implementation.cspProfile = 'pending';
      },
    },
    {
      name: 'cell commit drift',
      expectedFailure: 'implementation commit binding',
      mutate: (manifest) => {
        manifest.browserCells[0].implementation.commit = 'b'.repeat(64);
      },
    },
    {
      name: 'null performance observation',
      expectedFailure: 'frame-gap p95 budget',
      mutate: (manifest) => {
        manifest.browserCells[0].performance.frameGapP95Ms = null;
      },
    },
    {
      name: 'performance budget regression',
      expectedFailure: 'action-to-visible p95 budget',
      mutate: (manifest) => {
        manifest.browserCells[0].performance.actionToVisibleP95Ms = 50.01;
      },
    },
    {
      name: 'nine lifecycle cycles',
      expectedFailure: 'lifecycle cycles',
      mutate: (manifest) => {
        manifest.browserCells[0].lifecycle.cycles = 9;
      },
    },
    {
      name: 'NVDA pending',
      expectedFailure: 'NVDA pass',
      mutate: (manifest) => {
        manifest.browserCells[0].accessibility.nvda.status = 'pending';
      },
    },
    {
      name: 'artifact role substitution',
      expectedFailure: 'NVDA digest-bound artifact',
      mutate: (manifest) => {
        manifest.browserCells[0].accessibility.nvda.artifactId =
          manifest.browserCells[0].functional.rawArtifactId;
      },
    },
    {
      name: 'artifact digest drift',
      expectedFailure: 'on-disk digest',
      mutate: (manifest) => {
        manifest.artifacts[0].sha256 = '0'.repeat(64);
      },
    },
    {
      name: 'mock production host',
      expectedFailure: 'actual host is not a mock',
      mutate: (manifest) => {
        manifest.actualHost.mock = true;
      },
    },
    {
      name: 'production host package drift',
      expectedFailure: 'actual host package digest binding',
      mutate: (manifest) => {
        manifest.actualHost.packedPackageSha256 = 'c'.repeat(64);
      },
    },
    {
      name: 'independent review pending',
      expectedFailure: 'independent release review',
      mutate: (manifest) => {
        manifest.review.status = 'pending';
      },
    },
  ];

  for (const probe of probes) {
    const mutated = structuredClone(validManifest);
    probe.mutate(mutated);
    await writeManifest(mutated);
    const result = runVerifier();
    if (result.status === 0) {
      throw new Error(`${probe.name} unexpectedly promoted release evidence`);
    }
    const report = JSON.parse(
      await readFile(path.join(ROOT, REPORT_RELATIVE), 'utf8'),
    );
    const failures = report.nativeRelease?.failures ?? [];
    if (!failures.some((failure) => failure.includes(probe.expectedFailure))) {
      throw new Error(
        `${probe.name} did not report ${JSON.stringify(probe.expectedFailure)}: `
          + JSON.stringify(failures),
      );
    }
  }

  process.stdout.write(
    `PASS: local commit binding + native release positive proof + `
      + `${probes.length} negative drift probes\n`,
  );
} finally {
  await rm(TEMP, { recursive: true, force: true });
}

async function completeManifest(template) {
  const manifest = structuredClone(template);
  manifest.status = 'pass';
  manifest.implementation.commit = CANDIDATE_COMMIT;
  manifest.implementation.cspProfile = "default-src 'self'; object-src 'none'";
  manifest.performanceProfile.os.cumulativeBuild = 26_100;
  manifest.performanceProfile.gpu.driver = '32.0.101.6129';

  for (const artifact of manifest.artifacts) {
    const safeName = artifact.id.replaceAll(':', '--');
    const artifactRelative = path.join(
      TEMP_RELATIVE,
      'artifacts',
      `${safeName}.json`,
    );
    const bytes = Buffer.from(
      `${JSON.stringify({ id: artifact.id, role: artifact.role })}\n`,
      'utf8',
    );
    await mkdir(path.dirname(path.join(ROOT, artifactRelative)), {
      recursive: true,
    });
    await writeFile(path.join(ROOT, artifactRelative), bytes);
    artifact.path = artifactRelative;
    artifact.sha256 = sha256(bytes);
  }

  for (const cell of manifest.browserCells) {
    cell.status = 'pass';
    cell.implementation.commit = manifest.implementation.commit;
    cell.implementation.packedPackageSha256 =
      manifest.implementation.packedPackageSha256;
    cell.os.release = cell.os.name === 'Windows 10' ? '22H2' : '24H2';
    cell.os.build = cell.os.name === 'Windows 10' ? 19_045 : 26_100;
    cell.browser.exactVersion =
      cell.browser.releaseRank === 'latest' ? '143.0.7499.4' : '142.0.7444.175';
    cell.browser.executable =
      cell.browser.name === 'Chrome' ? 'chrome.exe' : 'msedge.exe';
    cell.functional.stableActualEqual = true;
    cell.functional.consoleErrors = 0;
    cell.functional.pageErrors = 0;
    cell.functional.networkErrors = 0;
    cell.functional.cleanupOwnerDelta = 0;
    cell.accessibility.nvda.status = 'pass';
    cell.accessibility.nvda.version = '2026.1';
    for (const input of Object.values(cell.inputs)) {
      input.status = 'pass';
      input.realCapableWindowsDevice = true;
    }
    cell.performance.frameGapP95Ms = 16;
    cell.performance.actionToVisibleP95Ms = 24;
    cell.performance.mainThreadTasksAtLeast100Ms = 0;
    cell.performance.droppedFrameRatio = 0;
    cell.performance.maximumFrozenBaselineRegressionPercent = 0;
    cell.lifecycle.postDestroyForcedGcGrowthMiB = 0.25;
    cell.lifecycle.canvasListenerTickerTextureDelta = 0;
  }

  manifest.actualHost.status = 'pass';
  manifest.actualHost.mock = false;
  manifest.actualHost.hostRevision = 'production-host/2026-07-29';
  manifest.actualHost.hostCommit = 'd'.repeat(40);
  manifest.security.status = 'pass';
  manifest.security.auditFindingCount = 0;
  manifest.migration.status = 'pass';
  manifest.migration.schemaRoundtrip = 'pass';
  manifest.migration.singleAuthoritativeEngine = 'pass';
  manifest.migration.rollbackRehearsal = 'pass';
  manifest.review.status = 'approved';
  manifest.review.reviewer = 'independent-release-reviewer';
  manifest.review.reviewedAt = '2026-07-29T00:00:00.000Z';
  return manifest;
}

function runVerifier(codeCommit = CANDIDATE_COMMIT) {
  return spawnSync(
    process.execPath,
    [
      VERIFIER,
      '--require-release',
      `--native-manifest=${MANIFEST_RELATIVE}`,
    ],
    {
      cwd: ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATCH_MAP_CODE_COMMIT: codeCommit,
        PATCH_MAP_RELEASE_READINESS_OUTPUT: REPORT_RELATIVE,
      },
    },
  );
}

async function writeManifest(manifest) {
  await writeFile(
    path.join(ROOT, MANIFEST_RELATIVE),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function assertExit(result, expected, label) {
  if (result.status !== expected) {
    throw new Error(
      `${label} exited ${String(result.status)}\n${result.stdout}\n${result.stderr}`,
    );
  }
}
