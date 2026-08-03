#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import {
  CAPABILITY_DEPENDENT_INPUTS,
  cellArtifactRole,
  PATCH_MAP_NATIVE_RELEASE_SCHEMA,
  MANDATORY_INPUTS,
  REQUIRED_BROWSER_CELLS,
  requiredNativeArtifactRoles,
} from './core-v2-native-release-contract.mjs';
import { argumentValue } from './patch-map-browser-launch.mjs';

const ROOT = process.cwd();
const ARGV = process.argv.slice(2);
const CODE_COMMIT = process.env.PATCH_MAP_CODE_COMMIT ?? 'uncommitted';
const OUTPUT_PATH = path.resolve(
  process.env.PATCH_MAP_RELEASE_READINESS_OUTPUT
    ?? path.join(ROOT, '.perf-results/release-readiness.json'),
);
const DECISION_FIXTURES_PATH = path.join(
  ROOT,
  'docs/reference/core-v2-functional-contract/evidence/decision-fixtures.v1.json',
);
const NATIVE_MANIFEST_PATH = argumentValue(ARGV, '--native-manifest');
const REQUIRE_RELEASE = ARGV.includes('--require-release');
const COMMIT_HASH = /^[a-f0-9]{40}$/u;
const SHA256_HASH = /^[a-f0-9]{64}$/u;
const FULL_RENDERER_SCALES = Object.freeze([
  100,
  500,
  1_000,
  2_000,
  5_000,
  'production',
]);
const PROHIBITED_PATH_SEGMENT = /(^|[\\/])(node_modules|dist|bundle)([\\/]|$)|\.map$|\.umd\.|\.bundle\./u;
const LOCAL_ARTIFACTS = Object.freeze([
  {
    id: 'browser-functional',
    path: 'performance/patch-map/results/browser-functional.json',
    codeCommit: (value) => value.codeCommit,
    pass: (value) =>
      value.status === 'pass'
      && value.headed === false
      && value.windowsNative === 'pending'
      && value.failures?.length === 0
      && everyErrorArrayEmpty(value.errors),
    classification: 'headless-local-functional-proxy',
  },
  {
    id: 'manual-lab-all-routes',
    path: 'performance/patch-map/results/manual-lab-functional.json',
    codeCommit: (value) => value.codeCommit,
    pass: (value) =>
      value.mode === 'all-routes'
      && value.routeCount === 173
      && value.checkCount === 192
      && value.passedCheckCount === 192
      && value.failedCheckCount === 0
      && value.environment?.headed === false
      && value.failures?.length === 0
      && everyErrorArrayEmpty(value.errors),
    classification: 'headless-173-route-human-lab-proxy',
  },
  {
    id: 'packed-consumer',
    path: 'performance/patch-map/results/package-consumer.json',
    codeCommit: (value) => value.provenance?.codeCommit,
    pass: (value) =>
      value.status === 'pass'
      && value.package === '@conalog/patch-map'
      && value.failures?.length === 0
      && value.provenance?.expectedEvidenceBound === true
      && SHA256_HASH.test(value.provenance?.packedPackageSha256 ?? '')
      && value.artifact?.sha256 === value.provenance?.packedPackageSha256
      && value.packageMatrix?.failure === null
      && value.packageMatrix?.remainingCanvasCount === 0
      && value.journeyMatrix?.journeyCount === 38
      && value.journeyMatrix?.passedJourneyCount === 38
      && value.journeyMatrix?.failedJourneyCount === 0
      && value.journeyMatrix?.cleanupFailureCount === 0
      && everyErrorArrayEmpty(value.errors),
    classification: 'packed-package-and-38-journey-proof',
  },
  {
    id: 'memory-lifecycle',
    path: 'performance/patch-map/results/memory-lifecycle.json',
    codeCommit: (value) => value.codeCommit,
    pass: (value) =>
      value.status === 'pass'
      && value.protocol?.warmups === 2
      && value.protocol?.measured === 7
      && value.lifecycleFailures?.length === 0
      && value.failures?.length === 0
      && everyErrorArrayEmpty(value.errors),
    classification: 'local-2-plus-7-lifecycle-proof',
  },
  {
    id: 'contract-performance',
    path: 'performance/patch-map/results/contract-performance.json',
    codeCommit: (value) => value.provenance?.codeCommit,
    pass: (value) =>
      value.status === 'complete'
      && value.protocol?.warmups === 2
      && value.protocol?.samples === 7
      && value.environment?.measurementClass === 'chromium-4x-development-proxy'
      && value.environment?.windowsNative === 'pending'
      && value.browser?.errorCount === 0,
    classification: 'chromium-4x-development-proxy',
  },
  {
    id: 'interaction-performance-5000',
    path:
      'docs/tasks/2026/07-15/performance-core-v2/evidence/interaction-performance-5000.json',
    codeCommit: (value) => value.codeCommit,
    pass: (value) =>
      value.status === 'pass'
      && value.protocol?.warmups === 2
      && value.protocol?.measured === 7
      && value.protocol?.size === 5_000
      && value.environment?.windowsNative === 'pending'
      && value.violations?.length === 0
      && everyErrorArrayEmpty(value.errors),
    classification: 'headless-1x-and-4x-interaction-proxy',
  },
  {
    id: 'bar-animation-pan-performance',
    path:
      'docs/tasks/2026/07-15/performance-core-v2/evidence/bar-animation-pan-performance.json',
    codeCommit: (value) => value.codeCommit,
    pass: (value) =>
      value.status === 'pass'
      && value.protocol?.warmups === 2
      && value.protocol?.measured === 7
      && value.protocol?.size === 5_000
      && value.environment?.windowsNative === 'pending'
      && value.profiles?.every((profile) => profile.budgetViolations?.length === 0)
      && everyErrorArrayEmpty(value.errors),
    classification: 'headless-1x-and-4x-overlap-proxy',
  },
  {
    id: 'full-renderer-performance',
    path: 'performance/patch-map/results/latest-full-4x.json',
    codeCommit: (value) => value.codeCommit,
    pass: fullRendererMatrixPass,
    classification: 'headless-full-scale-mesh-particle-4x-proxy',
  },
  {
    id: 'webgpu-experimental',
    path: 'performance/patch-map/results/webgpu-experimental.json',
    codeCommit: (value) => value.codeCommit,
    pass: (value) =>
      value.status === 'pass'
      && value.classification === 'experimental-non-production'
      && value.protocol?.requestedBackend === 'webgpu'
      && value.protocol?.fallbackPolicy?.includes('not exactly webgpu')
      && value.failures?.length === 0
      && everyErrorArrayEmpty(value.errors),
    classification: 'experimental-non-production',
  },
]);

const decisionFixtures = JSON.parse(await readFile(DECISION_FIXTURES_PATH, 'utf8'));
const runtimeDecision = requiredDecision(decisionFixtures, 'OQ-024');
const performanceDecision = requiredDecision(decisionFixtures, 'OQ-025');
const inputDecision = requiredDecision(decisionFixtures, 'OQ-029');
const localEvidence = [];
const localFailures = [];
const localArtifactValues = new Map();

const immutableContract = verifyImmutableContract();
if (!immutableContract.passed) {
  localFailures.push('immutable-contract:canonical-verifier');
}

for (const descriptor of LOCAL_ARTIFACTS) {
  const absolutePath = safeWorkspacePath(descriptor.path);
  const bytes = await readFile(absolutePath);
  const value = JSON.parse(bytes.toString('utf8'));
  localArtifactValues.set(descriptor.id, value);
  const artifactCommit = descriptor.codeCommit(value);
  const shapePass = descriptor.pass(value);
  const commitPass =
    COMMIT_HASH.test(CODE_COMMIT)
    && artifactCommit === CODE_COMMIT;
  const status = shapePass && commitPass ? 'pass' : 'fail';
  localEvidence.push({
    id: descriptor.id,
    path: descriptor.path,
    sha256: sha256(bytes),
    codeCommit: artifactCommit ?? null,
    codeCommitMatchesCandidate: commitPass,
    classification: descriptor.classification,
    status,
  });
  if (!shapePass) localFailures.push(`${descriptor.id}:artifact-shape`);
  if (!commitPass) localFailures.push(`${descriptor.id}:code-commit`);
}

let nativeEvidence = {
  status: 'pending',
  manifestPath: null,
  manifestSha256: null,
  checks: [],
  failures: [
    'native Windows 10/11 Chrome/Edge latest-two headed WebGL2 matrix is missing',
    'headed NVDA evidence on every supported browser cell is missing',
    'real mouse/precision-trackpad/keyboard/browser-zoom/CSS-transform/scroll/DPR traces are missing',
    'target Windows N100 2+7 performance and 10-cycle lifecycle evidence is missing',
    'packed actual-host 38-journey evidence is missing',
    'canary and rollback rehearsal evidence is missing',
    'independent release review is missing',
  ],
};
let nativeManifest = null;

if (NATIVE_MANIFEST_PATH) {
  try {
    const absolutePath = safeWorkspacePath(NATIVE_MANIFEST_PATH);
    const bytes = await readFile(absolutePath);
    nativeManifest = JSON.parse(bytes.toString('utf8'));
    nativeEvidence = await validateNativeManifest(nativeManifest, {
      manifestPath: path.relative(ROOT, absolutePath),
      manifestSha256: sha256(bytes),
      performanceProfile: performanceDecision.setup.profile,
      codeCommit: CODE_COMMIT,
      packedPackageSha256:
        localArtifactValues.get('packed-consumer')?.provenance?.packedPackageSha256
        ?? null,
    });
  } catch (error) {
    nativeEvidence = {
      status: 'fail',
      manifestPath: NATIVE_MANIFEST_PATH,
      manifestSha256: null,
      checks: [],
      failures: [error instanceof Error ? error.message : String(error)],
    };
  }
}

const localStatus = localFailures.length === 0 ? 'pass' : 'fail';
const releaseVerified = localStatus === 'pass' && nativeEvidence.status === 'pass';
const status = releaseVerified
  ? 'release-verified'
  : localStatus === 'fail' || nativeEvidence.status === 'fail'
    ? 'fail'
    : 'pending-external-evidence';
const report = {
  $schema: 'core-v2-release-readiness/1',
  generatedAt: new Date().toISOString(),
  codeCommit: CODE_COMMIT,
  status,
  releaseVerified,
  immutableContractModified: !immutableContract.passed,
  immutableContract,
  approvedProfile: {
    runtimeMatrix: runtimeDecision.setup,
    performance: performanceDecision.setup,
    inputDevices: inputDecision.setup,
  },
  localCandidate: {
    status: localStatus,
    evidence: localEvidence,
    failures: localFailures,
    interpretation:
      'Local headless/WebGL proxy, package, lifecycle, and experimental WebGPU evidence '
      + 'cannot promote native or assistive-technology cells.',
  },
  nativeRelease: nativeEvidence,
  promotionRule:
    'A structurally complete digest-bound native manifest remains pending until a qualified '
    + 'raw-artifact validator and independent authenticity review are available. Only that '
    + 'future qualified verification, together with valid local evidence and all eight headed '
    + 'Windows WebGL2 cells, may set releaseVerified to true.',
};

await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
await writeFile(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

if (releaseVerified) {
  process.stdout.write(
    `PASS: PatchMap release readiness verified with ${nativeEvidence.checks.length} native checks\n`,
  );
} else {
  process.stdout.write(
    `${status.toUpperCase()}: local=${localStatus}, native=${nativeEvidence.status}; `
      + `report=${OUTPUT_PATH}\n`,
  );
  if (REQUIRE_RELEASE || status === 'fail') process.exitCode = 1;
}

async function validateNativeManifest(manifest, context) {
  const checks = [];
  const failures = [];
  const artifactById = new Map();
  const artifactRoleCounts = new Map();

  add(manifest?.$schema === PATCH_MAP_NATIVE_RELEASE_SCHEMA, 'native manifest schema');
  add(manifest?.status === 'pass', 'native manifest terminal pass');
  add(COMMIT_HASH.test(manifest?.implementation?.commit ?? ''), 'implementation commit');
  if (COMMIT_HASH.test(context.codeCommit)) {
    add(
      manifest?.implementation?.commit === context.codeCommit,
      'native manifest implementation commit matches the candidate',
    );
  }
  add(
    SHA256_HASH.test(manifest?.implementation?.packedPackageSha256 ?? ''),
    'packed package SHA-256',
  );
  add(
    SHA256_HASH.test(context.packedPackageSha256 ?? '')
      && manifest?.implementation?.packedPackageSha256 === context.packedPackageSha256,
    'native manifest package digest matches fresh packed-consumer evidence',
  );
  add(
    /^8\.\d+\.\d+(?:[-+].+)?$/u.test(
      manifest?.implementation?.pixiVersion ?? '',
    ),
    'PixiJS v8 exact version',
  );
  add(
    /^\d+\.\d+\.\d+(?:[-+].+)?$/u.test(
      manifest?.implementation?.typescriptVersion ?? '',
    ),
    'TypeScript exact version',
  );
  add(
    /^[a-z0-9-]+@\d+\.\d+\.\d+(?:[-+].+)?$/u.test(
      manifest?.implementation?.bundler ?? '',
    ),
    'bundler exact version',
  );
  add(nonPlaceholder(manifest?.implementation?.cspProfile), 'CSP profile');

  const artifacts = Array.isArray(manifest?.artifacts) ? manifest.artifacts : [];
  add(artifacts.length > 0, 'digest-bound artifact inventory');
  for (const artifact of artifacts) {
    const label = `artifact ${String(artifact?.id ?? '<missing>')}`;
    const validId = nonEmpty(artifact?.id) && !artifactById.has(artifact.id);
    add(validId, `${label} unique ID`);
    if (validId) artifactById.set(artifact.id, artifact);
    add(nonEmpty(artifact?.role), `${label} role`);
    if (nonEmpty(artifact?.role)) {
      artifactRoleCounts.set(
        artifact.role,
        (artifactRoleCounts.get(artifact.role) ?? 0) + 1,
      );
    }
    add(SHA256_HASH.test(artifact?.sha256 ?? ''), `${label} SHA-256`);
    if (nonEmpty(artifact?.path) && SHA256_HASH.test(artifact?.sha256 ?? '')) {
      try {
        const absolutePath = safeWorkspacePath(artifact.path);
        await access(absolutePath);
        const bytes = await readFile(absolutePath);
        add(sha256(bytes) === artifact.sha256, `${label} on-disk digest`);
      } catch (error) {
        add(false, `${label} readable workspace path`, error instanceof Error ? error.message : String(error));
      }
    } else {
      add(false, `${label} path`);
    }
  }
  for (const role of requiredNativeArtifactRoles()) {
    add(
      artifactRoleCounts.get(role) === 1,
      `exactly one digest-bound artifact for role ${role}`,
    );
  }

  const profile = manifest?.performanceProfile;
  const canonical = context.performanceProfile;
  add(profile?.id === canonical.id, 'approved target profile ID');
  add(profile?.os?.name === canonical.os.name, 'target OS name');
  add(profile?.os?.release === canonical.os.release, 'target OS release');
  add(profile?.os?.architecture === canonical.os.architecture, 'target OS architecture');
  add(
    Number.isInteger(profile?.os?.cumulativeBuild)
      && profile.os.cumulativeBuild >= canonical.os.baseBuild,
    'exact Windows cumulative build',
  );
  add(profile?.cpu?.model === canonical.cpu.model, 'target CPU');
  add(profile?.cpu?.cores === canonical.cpu.cores, 'target CPU core count');
  add(profile?.cpu?.threads === canonical.cpu.threads, 'target CPU thread count');
  add(profile?.memory?.capacityGiB === canonical.memory.capacityGiB, 'target memory capacity');
  add(profile?.memory?.type === canonical.memory.type, 'target memory type');
  add(profile?.memory?.channels === canonical.memory.channels, 'target memory channels');
  add(profile?.gpu?.model === canonical.gpu.model, 'target GPU');
  add(nonPlaceholder(profile?.gpu?.driver), 'exact target GPU driver');
  add(deepEqual(profile?.display?.physicalPixels, canonical.display.physicalPixels), 'display pixels');
  add(profile?.display?.refreshHz === canonical.display.refreshHz, 'display refresh');
  add(
    deepEqual(profile?.display?.viewportCssPixels, canonical.display.viewportCssPixels),
    'CSS viewport',
  );
  add(
    profile?.display?.devicePixelRatio === canonical.display.devicePixelRatio,
    'device pixel ratio',
  );
  add(profile?.display?.osScalePercent === canonical.display.osScalePercent, 'OS scale');
  add(
    profile?.display?.browserZoomPercent === canonical.display.browserZoomPercent,
    'browser zoom',
  );
  add(profile?.power?.source === canonical.power.source, 'AC power');
  add(profile?.power?.windowsMode === canonical.power.windowsMode, 'Balanced power mode');
  add(profile?.power?.batterySaver === false, 'battery saver disabled');
  add(profile?.power?.remoteDesktopOrVm === false, 'physical non-remote target');
  add(
    profile?.power?.cooldownMinutesBeforeCell >= canonical.power.cooldownMinutesBeforeCell,
    'minimum cooldown',
  );

  const cells = Array.isArray(manifest?.browserCells) ? manifest.browserCells : [];
  const cellsById = new Map(cells.map((cell) => [cell?.id, cell]));
  add(cells.length === REQUIRED_BROWSER_CELLS.length, 'exact eight-cell browser matrix');
  for (const required of REQUIRED_BROWSER_CELLS) {
    const cell = cellsById.get(required.id);
    const label = `cell ${required.id}`;
    add(cell !== undefined, `${label} exists`);
    if (!cell) continue;
    add(cell.status === 'pass', `${label} terminal pass`);
    add(cell.os?.name === required.osName, `${label} OS`);
    add(nonPlaceholder(cell.os?.release), `${label} OS release`);
    add(Number.isInteger(cell.os?.build), `${label} OS build`);
    add(cell.browser?.name === required.browserName, `${label} browser`);
    add(cell.browser?.releaseRank === required.releaseRank, `${label} release rank`);
    add(nonPlaceholder(cell.browser?.exactVersion), `${label} exact browser version`);
    add(nonPlaceholder(cell.browser?.executable), `${label} exact browser executable`);
    add(
      cell.implementation?.commit === manifest?.implementation?.commit,
      `${label} implementation commit binding`,
    );
    add(
      cell.implementation?.packedPackageSha256
        === manifest?.implementation?.packedPackageSha256,
      `${label} packed package digest binding`,
    );
    add(cell.runtime?.headed === true, `${label} headed`);
    add(cell.runtime?.backend === 'webgl2', `${label} mandatory WebGL2 backend`);
    add(cell.runtime?.hardwareAcceleration === true, `${label} hardware acceleration`);
    add(cell.runtime?.devicePixelRatio === 1, `${label} DPR`);
    add(deepEqual(cell.runtime?.viewportCssPixels, [1_280, 720]), `${label} viewport`);
    add(cell.runtime?.browserZoomPercent === 100, `${label} browser zoom`);
    add(cell.functional?.caseCount === 173, `${label} 173 actual cases`);
    add(cell.functional?.freshSessionCount === 2, `${label} two fresh sessions`);
    add(cell.functional?.stableActualEqual === true, `${label} deterministic actuals`);
    add(cell.functional?.consoleErrors === 0, `${label} console errors`);
    add(cell.functional?.pageErrors === 0, `${label} page errors`);
    add(cell.functional?.networkErrors === 0, `${label} network errors`);
    add(cell.functional?.cleanupOwnerDelta === 0, `${label} cleanup owner delta`);
    add(
      artifactHasRole(
        cell.functional?.rawArtifactId,
        cellArtifactRole(required.id, 'functional'),
      ),
      `${label} functional digest-bound artifact`,
    );
    add(cell.accessibility?.nvda?.status === 'pass', `${label} NVDA pass`);
    add(nonPlaceholder(cell.accessibility?.nvda?.version), `${label} NVDA exact version`);
    add(
      artifactHasRole(
        cell.accessibility?.nvda?.artifactId,
        cellArtifactRole(required.id, 'nvda'),
      ),
      `${label} NVDA digest-bound artifact`,
    );
    for (const input of MANDATORY_INPUTS) {
      const inputEvidence = cell.inputs?.[input];
      add(inputEvidence?.status === 'pass', `${label} ${input} pass`);
      add(
        artifactHasRole(
          inputEvidence?.artifactId,
          cellArtifactRole(required.id, 'inputs'),
        ),
        `${label} ${input} artifact`,
      );
    }
    for (const capability of CAPABILITY_DEPENDENT_INPUTS) {
      const capabilityEvidence = cell.inputs?.[capability];
      const valid =
        capabilityEvidence?.status === 'not-present-on-device'
        || (
          capabilityEvidence?.status === 'pass'
          && capabilityEvidence?.realCapableWindowsDevice === true
        );
      add(valid, `${label} ${capability} honest capability result`);
      add(
        artifactHasRole(
          capabilityEvidence?.artifactId,
          cellArtifactRole(required.id, 'inputs'),
        ),
        `${label} ${capability} inventory artifact`,
      );
    }
    const performance = cell.performance;
    add(performance?.warmups === 2, `${label} performance warmups`);
    add(performance?.measuredSamples === 7, `${label} performance measured samples`);
    add(
      finiteAtMost(performance?.frameGapP95Ms, 33),
      `${label} frame-gap p95 budget`,
    );
    add(
      finiteAtMost(performance?.actionToVisibleP95Ms, 50),
      `${label} action-to-visible p95 budget`,
    );
    add(
      performance?.mainThreadTasksAtLeast100Ms === 0,
      `${label} main-thread long-task budget`,
    );
    add(
      finiteAtMost(performance?.droppedFrameRatio, 0.02),
      `${label} dropped-frame budget`,
    );
    add(
      Number.isFinite(performance?.maximumFrozenBaselineRegressionPercent)
        && performance.maximumFrozenBaselineRegressionPercent <= 10,
      `${label} frozen-baseline regression budget`,
    );
    add(
      artifactHasRole(
        performance?.rawArtifactId,
        cellArtifactRole(required.id, 'performance'),
      ),
      `${label} raw performance artifact`,
    );
    const lifecycle = cell.lifecycle;
    add(lifecycle?.cycles === 10, `${label} lifecycle cycles`);
    add(
      finiteAtMost(lifecycle?.postDestroyForcedGcGrowthMiB, 2),
      `${label} forced-GC growth budget`,
    );
    add(lifecycle?.canvasListenerTickerTextureDelta === 0, `${label} owner cleanup`);
    add(
      artifactHasRole(
        lifecycle?.rawArtifactId,
        cellArtifactRole(required.id, 'lifecycle'),
      ),
      `${label} lifecycle artifact`,
    );
  }

  add(cellsById.size === REQUIRED_BROWSER_CELLS.length, 'no duplicate or extra browser cells');
  add(manifest?.actualHost?.status === 'pass', 'actual production host pass');
  add(manifest?.actualHost?.mock === false, 'actual host is not a mock');
  add(manifest?.actualHost?.journeyCount === 38, 'actual host 38 journeys');
  add(nonPlaceholder(manifest?.actualHost?.hostRevision), 'actual host revision');
  add(COMMIT_HASH.test(manifest?.actualHost?.hostCommit ?? ''), 'actual host commit');
  add(
    manifest?.actualHost?.packedPackageSha256
      === manifest?.implementation?.packedPackageSha256,
    'actual host package digest binding',
  );
  add(artifactHasRole(manifest?.actualHost?.artifactId, 'actual-host'), 'actual host artifact');

  add(manifest?.security?.status === 'pass', 'security gate');
  add(manifest?.security?.auditFindingCount === 0, 'security audit findings');
  add(artifactHasRole(manifest?.security?.artifactId, 'security'), 'security artifact');
  add(manifest?.migration?.status === 'pass', 'migration gate');
  add(manifest?.migration?.schemaRoundtrip === 'pass', 'schema roundtrip');
  add(manifest?.migration?.singleAuthoritativeEngine === 'pass', 'single engine authority');
  add(deepEqual(manifest?.migration?.canaryStagesPercent, [1, 10, 50, 100]), 'canary stages');
  add(manifest?.migration?.rollbackRehearsal === 'pass', 'rollback rehearsal');
  add(artifactHasRole(manifest?.migration?.artifactId, 'migration'), 'migration artifact');
  add(manifest?.review?.status === 'approved', 'independent release review');
  add(nonPlaceholder(manifest?.review?.reviewer), 'release reviewer');
  add(
    nonPlaceholder(manifest?.review?.reviewedAt)
      && Number.isFinite(Date.parse(manifest.review.reviewedAt)),
    'release review date',
  );
  add(artifactHasRole(manifest?.review?.artifactId, 'review'), 'review artifact');

  if (failures.length === 0) {
    checks.push({
      label: 'qualified external raw artifact validation',
      status: 'pending',
    });
  }
  return {
    status: failures.length === 0 ? 'pending' : 'fail',
    manifestPath: context.manifestPath,
    manifestSha256: context.manifestSha256,
    checks,
    failures: failures.length === 0
      ? ['qualified external raw artifact validation and independent authenticity review are pending']
      : failures,
  };

  function add(condition, label, observation = undefined) {
    const record = {
      label,
      status: condition ? 'pass' : 'fail',
      ...(observation === undefined ? {} : { observation }),
    };
    checks.push(record);
    if (!condition) failures.push(label);
  }

  function artifactHasRole(id, role) {
    return nonEmpty(id) && artifactById.get(id)?.role === role;
  }
}

function verifyImmutableContract() {
  const verifiers = [
    'scripts/verification/verify-core-v2-decision-evidence.mjs',
    'scripts/verification/verify-core-v2-catalog-static-gates.mjs',
    'scripts/verification/verify-core-v2-catalog.mjs',
  ];
  const checks = verifiers.map((relativePath) => {
    const result = spawnSync(process.execPath, [path.join(ROOT, relativePath)], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    return {
      path: relativePath,
      status: result.status === 0 ? 'pass' : 'fail',
      exitCode: result.status,
      ...(result.status === 0
        ? {}
        : { error: (result.stderr || result.stdout || 'verifier failed').trim() }),
    };
  });
  return {
    passed: checks.every(({ status }) => status === 'pass'),
    checks,
  };
}

function fullRendererMatrixPass(value) {
  const runs = Array.isArray(value?.runs) ? value.runs : [];
  const signatures = new Set(
    runs.map((run) => `${run?.role}/${run?.strategy}/${String(run?.scale)}`),
  );
  const expectedSignatures = FULL_RENDERER_SCALES.flatMap((scale) => [
    `spike/mesh/${String(scale)}`,
    `spike/particle/${String(scale)}`,
    `selected/mesh/${String(scale)}`,
  ]);
  return value?.schemaVersion === 1
    && value?.mode === 'full'
    && value?.protocol?.warmups === 2
    && value?.protocol?.measured === 7
    && value?.protocol?.cpuThrottleRate === 4
    && deepEqual(value?.protocol?.scales, FULL_RENDERER_SCALES)
    && value?.selection?.selectedStrategy === 'mesh'
    && value?.environment?.headed === false
    && value?.environment?.windowsNative === 'pending'
    && everyErrorArrayEmpty(value?.browser)
    && runs.length === expectedSignatures.length
    && signatures.size === expectedSignatures.length
    && expectedSignatures.every((signature) => signatures.has(signature))
    && runs.every(rendererMatrixRunPass);
}

function rendererMatrixRunPass(run) {
  const summary = run?.summary;
  return Array.isArray(run?.warmupRaw)
    && run.warmupRaw.length === 2
    && Array.isArray(run?.measuredRaw)
    && run.measuredRaw.length === 7
    && summary
    && typeof summary === 'object'
    && Object.values(summary).length > 0
    && Object.values(summary).every((metric) =>
      Array.isArray(metric?.samples)
      && metric.samples.length === 7
      && metric.samples.every(Number.isFinite)
      && Number.isFinite(metric?.min)
      && Number.isFinite(metric?.median)
      && Number.isFinite(metric?.p95)
      && Number.isFinite(metric?.max));
}

function requiredDecision(fixtures, decision) {
  const record = fixtures.cases?.find((entry) => entry.decision === decision);
  if (!record) throw new Error(`missing approved decision fixture ${decision}`);
  return record;
}

function safeWorkspacePath(value) {
  if (!nonEmpty(value)) throw new Error('evidence path must be a non-empty string');
  if (PROHIBITED_PATH_SEGMENT.test(value)) {
    throw new Error(`prohibited evidence path: ${value}`);
  }
  const absolutePath = path.resolve(ROOT, value);
  const relativePath = path.relative(ROOT, absolutePath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error(`evidence path leaves the PatchMap worktree: ${value}`);
  }
  return absolutePath;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function everyErrorArrayEmpty(value) {
  return value
    && typeof value === 'object'
    && Object.values(value).every((entry) => !Array.isArray(entry) || entry.length === 0);
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function nonPlaceholder(value) {
  return nonEmpty(value)
    && !/(^|[-_ ])(?:pending|replace|unknown|todo)(?:$|[-_ ])/iu.test(value);
}

function finiteAtMost(value, maximum) {
  return Number.isFinite(value) && value >= 0 && value <= maximum;
}

function deepEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}
