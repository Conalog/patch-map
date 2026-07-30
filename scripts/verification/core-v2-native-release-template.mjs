#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import {
  CAPABILITY_DEPENDENT_INPUTS,
  cellArtifactRole,
  PATCH_MAP_NATIVE_RELEASE_SCHEMA,
  GLOBAL_NATIVE_ARTIFACT_ROLES,
  MANDATORY_INPUTS,
  REQUIRED_BROWSER_CELLS,
} from './core-v2-native-release-contract.mjs';

const ROOT = process.cwd();
const PROHIBITED_PATH_SEGMENT =
  /(^|[\\/])(node_modules|dist|bundle)([\\/]|$)|\.map$|\.umd\.|\.bundle\./u;
const decisionFixtures = JSON.parse(
  await readFile(
    path.join(
      ROOT,
      'docs/reference/core-v2-functional-contract/evidence/decision-fixtures.v1.json',
    ),
    'utf8',
  ),
);
const packageJson = JSON.parse(
  await readFile(path.join(ROOT, 'package.json'), 'utf8'),
);
const packageEvidence = JSON.parse(
  await readFile(
    path.join(ROOT, 'performance/core-v2/results/package-consumer.json'),
    'utf8',
  ),
);
const outputPath = safeWorkspacePath(
  argumentValue('--output')
    ?? 'performance/core-v2/results/native-release-template.json',
);
const runtimeDecision = requiredDecision(decisionFixtures, 'OQ-024');
const performanceDecision = requiredDecision(decisionFixtures, 'OQ-025');
const inputDecision = requiredDecision(decisionFixtures, 'OQ-029');
const candidateCommit =
  argumentValue('--commit')
  ?? process.env.PATCH_MAP_CODE_COMMIT
  ?? packageEvidence.provenance?.codeCommit
  ?? 'pending';
const packedPackageSha256 =
  packageEvidence.provenance?.packedPackageSha256 ?? 'pending';

assertApprovedShape(runtimeDecision, performanceDecision, inputDecision);

const artifactDescriptors = [
  ...REQUIRED_BROWSER_CELLS.flatMap(({ id }) =>
    ['functional', 'nvda', 'inputs', 'performance', 'lifecycle'].map((kind) => ({
      id: cellArtifactRole(id, kind),
      role: cellArtifactRole(id, kind),
      path: `performance/core-v2/results/native/${id}/${artifactFilename(kind)}`,
      sha256: 'pending',
    }))),
  ...GLOBAL_NATIVE_ARTIFACT_ROLES.map((role) => ({
    id: role,
    role,
    path: `performance/core-v2/results/native/${role}.json`,
    sha256: 'pending',
  })),
];

const manifest = {
  $schema: PATCH_MAP_NATIVE_RELEASE_SCHEMA,
  generatedAt: new Date().toISOString(),
  status: 'pending',
  implementation: {
    commit: candidateCommit,
    packedPackageSha256,
    pixiVersion: packageJson.devDependencies?.['pixi.js'] ?? 'pending',
    typescriptVersion: packageJson.devDependencies?.typescript ?? 'pending',
    bundler: `vite@${packageJson.devDependencies?.vite ?? 'pending'}`,
    cspProfile: 'pending',
  },
  performanceProfile: createPerformanceProfile(
    performanceDecision.setup.profile,
  ),
  browserCells: REQUIRED_BROWSER_CELLS.map((cell) =>
    createBrowserCell(cell, candidateCommit, packedPackageSha256)),
  actualHost: {
    status: 'pending',
    mock: null,
    journeyCount: 38,
    hostRevision: 'pending',
    hostCommit: 'pending',
    packedPackageSha256,
    artifactId: 'actual-host',
  },
  security: {
    status: 'pending',
    auditFindingCount: null,
    artifactId: 'security',
  },
  migration: {
    status: 'pending',
    schemaRoundtrip: 'pending',
    singleAuthoritativeEngine: 'pending',
    canaryStagesPercent: [1, 10, 50, 100],
    rollbackRehearsal: 'pending',
    artifactId: 'migration',
  },
  review: {
    status: 'pending',
    reviewer: 'pending',
    reviewedAt: 'pending',
    artifactId: 'review',
  },
  artifacts: artifactDescriptors,
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
process.stdout.write(
  `WROTE: pending native release manifest with ${manifest.browserCells.length} cells `
    + `and ${manifest.artifacts.length} artifact slots to ${outputPath}\n`,
);

function createPerformanceProfile(canonical) {
  return {
    id: canonical.id,
    os: {
      name: canonical.os.name,
      release: canonical.os.release,
      architecture: canonical.os.architecture,
      cumulativeBuild: null,
    },
    cpu: {
      model: canonical.cpu.model,
      cores: canonical.cpu.cores,
      threads: canonical.cpu.threads,
    },
    memory: {
      capacityGiB: canonical.memory.capacityGiB,
      type: canonical.memory.type,
      channels: canonical.memory.channels,
    },
    gpu: {
      model: canonical.gpu.model,
      driver: 'pending',
    },
    display: structuredClone(canonical.display),
    power: structuredClone(canonical.power),
  };
}

function artifactFilename(kind) {
  const filenames = {
    functional: 'functional-173-fresh.json',
    nvda: 'nvda.json',
    inputs: 'inputs.json',
    performance: 'performance-2-plus-7.json',
    lifecycle: 'memory-lifecycle.json',
  };
  return filenames[kind];
}

function createBrowserCell(cell, commit, packageSha256) {
  const inputsArtifactId = cellArtifactRole(cell.id, 'inputs');
  return {
    id: cell.id,
    status: 'pending',
    implementation: {
      commit,
      packedPackageSha256: packageSha256,
    },
    os: {
      name: cell.osName,
      release: 'pending',
      build: null,
    },
    browser: {
      name: cell.browserName,
      releaseRank: cell.releaseRank,
      exactVersion: 'pending',
      executable: 'pending',
    },
    runtime: {
      headed: true,
      backend: 'webgl2',
      hardwareAcceleration: true,
      devicePixelRatio: 1,
      viewportCssPixels: [1_280, 720],
      browserZoomPercent: 100,
    },
    functional: {
      caseCount: 173,
      freshSessionCount: 2,
      stableActualEqual: null,
      consoleErrors: null,
      pageErrors: null,
      networkErrors: null,
      cleanupOwnerDelta: null,
      rawArtifactId: cellArtifactRole(cell.id, 'functional'),
    },
    accessibility: {
      nvda: {
        status: 'pending',
        version: 'pending',
        artifactId: cellArtifactRole(cell.id, 'nvda'),
      },
    },
    inputs: Object.fromEntries([
      ...MANDATORY_INPUTS.map((input) => [
        input,
        { status: 'pending', artifactId: inputsArtifactId },
      ]),
      ...CAPABILITY_DEPENDENT_INPUTS.map((input) => [
        input,
        {
          status: 'pending',
          realCapableWindowsDevice: null,
          artifactId: inputsArtifactId,
        },
      ]),
    ]),
    performance: {
      warmups: 2,
      measuredSamples: 7,
      frameGapP95Ms: null,
      actionToVisibleP95Ms: null,
      mainThreadTasksAtLeast100Ms: null,
      droppedFrameRatio: null,
      maximumFrozenBaselineRegressionPercent: null,
      rawArtifactId: cellArtifactRole(cell.id, 'performance'),
    },
    lifecycle: {
      cycles: 10,
      postDestroyForcedGcGrowthMiB: null,
      canvasListenerTickerTextureDelta: null,
      rawArtifactId: cellArtifactRole(cell.id, 'lifecycle'),
    },
  };
}

function assertApprovedShape(runtime, performance, inputs) {
  if (
    runtime.setup.mandatoryBackend !== 'WebGL2'
    || performance.setup.globalBudgets.lifecycleCycles !== 10
    || inputs.setup.mandatory.length !== MANDATORY_INPUTS.length
    || inputs.setup.capabilityDependent.length !== CAPABILITY_DEPENDENT_INPUTS.length
  ) {
    throw new Error('approved native release decision shape drifted');
  }
}

function requiredDecision(fixtures, decision) {
  const record = fixtures.cases?.find((entry) => entry.decision === decision);
  if (!record) throw new Error(`missing approved decision fixture ${decision}`);
  return record;
}

function argumentValue(name) {
  const inlinePrefix = `${name}=`;
  const inline = process.argv.find((argument) => argument.startsWith(inlinePrefix));
  if (inline) return inline.slice(inlinePrefix.length);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function safeWorkspacePath(value) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('template output path must be a non-empty string');
  }
  if (PROHIBITED_PATH_SEGMENT.test(value)) {
    throw new Error(`prohibited template output path: ${value}`);
  }
  const absolutePath = path.resolve(ROOT, value);
  const relativePath = path.relative(ROOT, absolutePath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error(`template output path leaves the Core v2 worktree: ${value}`);
  }
  return absolutePath;
}
