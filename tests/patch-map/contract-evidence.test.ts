import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

interface ActualResult {
  readonly observation: Readonly<Record<string, unknown>>;
  readonly actualSemanticSha256: string;
  readonly actualObservationSha256: string;
}

interface ComparisonResult {
  readonly assertions: readonly Readonly<Record<string, unknown>>[];
  readonly passed: number;
  readonly failed: number;
  readonly firstFailure: Readonly<Record<string, unknown>> | null;
  readonly stableActualSha256: string;
  readonly comparisonSha256: string;
}

interface EvidenceRuntime {
  canonicalSha256(this: void, value: unknown): string;
  sha256Bytes(this: void, value: string): string;
  writeExecutionEvidenceRun(
    this: void,
    options: unknown,
  ): Promise<Readonly<{ runDirectory: string; overlay: Readonly<Record<string, unknown>> }>>;
}

interface ObserverRuntime {
  createSemanticObservation(
    this: void,
    options: Readonly<{ observation: unknown }>,
  ): ActualResult;
}

interface ComparatorRuntime {
  compareObservation(
    this: void,
    options: Readonly<{ expectedCase: unknown; actual: unknown }>,
  ): ComparisonResult;
}

interface VerifierRuntime {
  loadCanonicalCatalogBinding(
    this: void,
  ): Promise<Readonly<Record<string, unknown>>>;
  verifyExecutionResults(
    this: void,
    runDirectory: string,
    options?: unknown,
  ): Promise<Readonly<{
    runId: string;
    caseCount: number;
    summary: Readonly<Record<string, number>>;
    integrityVerified: boolean;
    catalogBindingVerified: boolean;
    packageArtifactVerified: boolean;
    executionPassed: boolean;
    verified: boolean;
    promotionVerified: boolean;
  }>>;
}

async function loadRuntime<T>(relativePath: string): Promise<T> {
  const moduleNamespace: unknown = await import(
    /* @vite-ignore */ new URL(relativePath, import.meta.url).href
  );
  return moduleNamespace as T;
}

const [evidenceRuntime, observerRuntime, comparatorRuntime, verifierRuntime] = await Promise.all([
  loadRuntime<EvidenceRuntime>('../../scripts/verification/patch-map-contract/evidence.mjs'),
  loadRuntime<ObserverRuntime>('../../scripts/verification/patch-map-contract/observe.mjs'),
  loadRuntime<ComparatorRuntime>('../../scripts/verification/patch-map-contract/compare.mjs'),
  loadRuntime<VerifierRuntime>('../../scripts/verification/patch-map-contract/verify-results.mjs'),
]);

const { canonicalSha256, sha256Bytes, writeExecutionEvidenceRun } = evidenceRuntime;
const { createSemanticObservation } = observerRuntime;
const { compareObservation } = comparatorRuntime;
const { loadCanonicalCatalogBinding, verifyExecutionResults } = verifierRuntime;

const HASHES = {
  catalog: '1'.repeat(64),
  review: '2'.repeat(64),
  action: '3'.repeat(64),
  observation: '4'.repeat(64),
  fixture: '5'.repeat(64),
  package: '6'.repeat(64),
  dataset: '7'.repeat(64),
  trace: '8'.repeat(64),
};

const catalog = {
  contractRevision: 'patch-map-contract/1',
  observationRevision: 'patch-map-semantic-observation/1',
  catalogManifestSha256: HASHES.catalog,
  reviewRegistrySha256: HASHES.review,
  actionSchemaSha256: HASHES.action,
  observationSchemaSha256: HASHES.observation,
};

const packageBinding = {
  name: '@conalog/patch-map',
  subpath: '@conalog/patch-map',
  version: '0.10.0',
  packedPackageSha256: HASHES.package,
  implementationCommit: '0123456789abcdef',
  pixiVersion: '8.19.0',
};

const environment = {
  browser: 'Chromium',
  browserVersion: '140.0.0',
  os: 'test-os',
  hardware: 'test-hardware',
  backend: 'webgl2',
  devicePixelRatio: 1,
  viewportCssPx: [1280, 720],
  powerProfile: 'test',
  fontFixtureRevision: 'font/1',
  assetFixtureRevision: 'asset/1',
};

let temporaryRoot = '';

beforeEach(async () => {
  temporaryRoot = await mkdtemp(path.join(tmpdir(), 'patch-map-evidence-'));
});

afterEach(async () => {
  await rm(temporaryRoot, { recursive: true, force: true });
});

function expectedCase(caseId = 'LIF-001'): Record<string, unknown> {
  return {
    id: caseId,
    caseType: 'capability',
    expected: {
      assertions: [
        { path: '/outcome/status', operator: 'eq', value: 'ok' },
        { path: '/resources/leakDelta', operator: 'zero', value: 0 },
      ],
      observationDomains: ['outcome', 'resources'],
      semanticObservationRevision: 'patch-map-semantic-observation/1',
      implementationNeutral: true,
    },
    volatileFields: ['provenance.codeCommit'],
  };
}

function observation(
  caseId: string,
  expectedRecordSha256: string,
  codeCommit: string,
  packedPackageSha256 = HASHES.package,
): Record<string, unknown> {
  return {
    $schema: 'patch-map-semantic-observation/1',
    case: { id: caseId, caseType: 'capability', params: { size: '100', seed: 319 } },
    provenance: {
      catalogManifestSha256: HASHES.catalog,
      reviewRegistrySha256: HASHES.review,
      fixtureSha256: HASHES.fixture,
      expectedRecordSha256,
      actionSchemaSha256: HASHES.action,
      observationSchemaSha256: HASHES.observation,
      packedPackageSha256,
      runnerVersion: '1',
      codeCommit,
    },
    environment,
    revisions: { scene: 1, view: 0, interaction: 0 },
    scene: { ids: ['item-a'] },
    geometry: { finiteValueCount: 4 },
    text: { unpairedSurrogates: 0 },
    paint: { unresolvedIntentCount: 0 },
    interaction: { staleGestureCount: 0 },
    events: { unclassifiedCount: 0 },
    history: { depth: 0 },
    accessibility: { invalidNodeCount: 0 },
    outcome: { status: 'ok', unclassifiedErrorCount: 0 },
    resources: { leakDelta: 0 },
  };
}

function catalogBinding(caseIndex: number, expectedRecordSha256: string): Record<string, unknown> {
  return {
    ...catalog,
    fixtureRef: `patch-map-contract-catalog-fixtures/1#/cases/${caseIndex}`,
    fixtureSha256: HASHES.fixture,
    expectedRef: `patch-map-contract-catalog-normalized-expected/1#/cases/${caseIndex}`,
    expectedRecordSha256,
  };
}

function caseInput(caseId: string): Record<string, unknown> {
  return {
    route: `/lab/patch-map?scenario=${caseId}&size=100&seed=319`,
    size: '100',
    seed: 319,
    repeatIndex: 0,
    datasetSha256: HASHES.dataset,
    actionTraceSha256: HASHES.trace,
    actionCount: 1,
    volatileFields: ['provenance.codeCommit'],
  };
}

function zeroCleanup(): Record<string, number> {
  return {
    canvas: 0,
    listener: 0,
    observer: 0,
    ticker: 0,
    animation: 0,
    textureLease: 0,
    pendingWork: 0,
  };
}

function session(
  id: 'fresh-a' | 'fresh-b',
  caseId: string,
  approvedExpected: Record<string, unknown>,
  expectedRecordSha256: string,
  codeCommit: string,
  packedPackageSha256 = HASHES.package,
): Record<string, unknown> {
  const actual = createSemanticObservation({
    observation: observation(caseId, expectedRecordSha256, codeCommit, packedPackageSha256),
  });
  const comparison = compareObservation({ expectedCase: approvedExpected, actual: actual.observation });
  return {
    id,
    actual,
    comparison,
    publishedTuple: { scene: 1, view: 0, interaction: 0 },
    actionResults: [{ index: 0, handlerId: 'contract/initialize', status: 'completed' }],
    timing: { actionMs: 1, maximumFrameGapMs: 2, longTaskCount: 0 },
    errors: { console: [], page: [], network: [] },
    cleanup: zeroCleanup(),
  };
}

function passOptions(
  runId = '20260716T120000Z_abcdef12_r1',
  packedPackageSha256 = HASHES.package,
): Record<string, unknown> {
  const approvedExpected = expectedCase();
  const expectedRecordSha256 = canonicalSha256(approvedExpected);
  return {
    outputRoot: path.join(temporaryRoot, 'results'),
    runId,
    catalog,
    package: { ...packageBinding, packedPackageSha256 },
    runner: {
      id: 'patch-map-contract-runner',
      version: '1',
      command: ['node', 'run.mjs', '--headed'],
      headed: true,
    },
    cases: [{
      caseId: 'LIF-001',
      caseType: 'capability',
      priority: 'P0',
      catalogBinding: catalogBinding(0, expectedRecordSha256),
      input: caseInput('LIF-001'),
      environment,
      sessions: [
        session('fresh-a', 'LIF-001', approvedExpected, expectedRecordSha256, 'commit-a', packedPackageSha256),
        session('fresh-b', 'LIF-001', approvedExpected, expectedRecordSha256, 'commit-b', packedPackageSha256),
      ],
      result: 'pass',
      blockedBy: null,
    }],
  };
}

function firstCase(options: Record<string, unknown>): Record<string, unknown> {
  const record = (options.cases as Record<string, unknown>[])[0];
  if (record === undefined) throw new Error('test case fixture missing');
  return record;
}

function sessionAt(options: Record<string, unknown>, index: number): Record<string, unknown> {
  const record = (firstCase(options).sessions as Record<string, unknown>[])[index];
  if (record === undefined) throw new Error(`test session fixture ${index} missing`);
  return record;
}

function externalCatalogBindingFor(options: Record<string, unknown>): Record<string, unknown> {
  const cases = options.cases as Record<string, unknown>[];
  return {
    ...(options.catalog as Record<string, unknown>),
    cases: Object.fromEntries(cases.map((record) => [
      record.caseId as string,
      structuredClone(record.catalogBinding),
    ])),
  };
}

function verificationOptionsFor(
  options: Record<string, unknown>,
  includePackage = true,
): Record<string, unknown> {
  return {
    catalogBinding: externalCatalogBindingFor(options),
    ...(includePackage ? { packageBinding: structuredClone(options.package) } : {}),
  };
}

describe('append-only PatchMap execution evidence', () => {
  it('loads the checked-in canonical catalog as an external read-only trust anchor', async () => {
    const binding = await loadCanonicalCatalogBinding();
    expect(binding.contractRevision).toBe('patch-map-contract/1');
    expect(Object.keys(binding.cases as Record<string, unknown>)).toHaveLength(169);
    expect(Object.isFrozen(binding)).toBe(true);
  });

  it('writes and offline-verifies two fresh completed sessions with not-reviewed evidence', async () => {
    const options = passOptions();
    const written = await writeExecutionEvidenceRun(options);
    const verified = await verifyExecutionResults(written.runDirectory, verificationOptionsFor(options));
    const evidencePath = path.join(written.runDirectory, 'cases/lif-001/evidence.json');
    const evidence = JSON.parse(await readFile(evidencePath, 'utf8')) as Record<string, unknown>;

    expect(verified).toEqual({
      runId: '20260716T120000Z_abcdef12_r1',
      caseCount: 1,
      summary: {
        pass: 1,
        fail: 0,
        'not-implemented': 0,
        'unsupported-environment': 0,
        'not-run': 0,
      },
      integrityVerified: true,
      catalogBindingVerified: true,
      packageArtifactVerified: true,
      executionPassed: true,
      verified: true,
      promotionVerified: false,
    });
    expect(evidence.review).toEqual({
      status: 'not-reviewed',
      reviewer: null,
      reviewedAt: null,
      supersedes: null,
    });
    expect((evidence.sessions as Array<{ actionResults: Array<{ status: string }> }>)[0]?.actionResults[0]?.status).toBe('completed');
  });

  it('requires independent catalog and package trust anchors', async () => {
    const options = passOptions('20260716T120010Z_abcdef12_r1');
    const written = await writeExecutionEvidenceRun(options);
    const externalCatalog = externalCatalogBindingFor(options);

    await expect(verifyExecutionResults(written.runDirectory)).rejects.toThrow(/external catalog binding required/);

    const topMismatch = structuredClone(externalCatalog);
    topMismatch.reviewRegistrySha256 = '9'.repeat(64);
    const topMismatchCase = (topMismatch.cases as Record<string, Record<string, unknown>>)['LIF-001'];
    if (topMismatchCase === undefined) throw new Error('external catalog case fixture missing');
    topMismatchCase.reviewRegistrySha256 = '9'.repeat(64);
    await expect(verifyExecutionResults(written.runDirectory, {
      catalogBinding: topMismatch,
      packageBinding: options.package,
    })).rejects.toThrow(/external catalog binding mismatch/);

    const caseMismatch = structuredClone(externalCatalog);
    const externalCase = (caseMismatch.cases as Record<string, Record<string, unknown>>)['LIF-001'];
    if (externalCase === undefined) throw new Error('external catalog case fixture missing');
    externalCase.fixtureSha256 = '9'.repeat(64);
    await expect(verifyExecutionResults(written.runDirectory, {
      catalogBinding: caseMismatch,
      packageBinding: options.package,
    })).rejects.toThrow(/external catalog case mismatch/);

    await expect(verifyExecutionResults(written.runDirectory, {
      catalogBinding: externalCatalog,
    })).rejects.toThrow(/external package binding required/);

    const packageMismatch = structuredClone(options.package) as Record<string, unknown>;
    packageMismatch.packedPackageSha256 = '9'.repeat(64);
    await expect(verifyExecutionResults(written.runDirectory, {
      catalogBinding: externalCatalog,
      packageBinding: packageMismatch,
    })).rejects.toThrow(/external package binding mismatch/);
  });

  it('can bind pass evidence directly to opaque packed artifact bytes', async () => {
    const packagePath = path.join(temporaryRoot, 'patch-map-package.tgz');
    const packageBytes = 'opaque packed package fixture';
    await writeFile(packagePath, packageBytes, 'utf8');
    const options = passOptions('20260716T120011Z_abcdef12_r1', sha256Bytes(packageBytes));
    const written = await writeExecutionEvidenceRun(options);

    const verified = await verifyExecutionResults(written.runDirectory, {
      catalogBinding: externalCatalogBindingFor(options),
      packedArtifactPath: packagePath,
    });
    expect(verified.packageArtifactVerified).toBe(true);
    expect(verified.promotionVerified).toBe(false);
  });

  it('never overwrites an existing run', async () => {
    const options = passOptions();
    await writeExecutionEvidenceRun(options);
    await expect(writeExecutionEvidenceRun(options)).rejects.toThrow(/run already exists/);
  });

  it('rejects unsafe paths, one-session pass, nonzero cleanup, fabricated action pass, and digest mismatch', async () => {
    const unsafe = passOptions('../escape');
    await expect(writeExecutionEvidenceRun(unsafe)).rejects.toThrow(/unsafe path segment/);

    const oneSession = passOptions('20260716T120001Z_abcdef12_r1');
    firstCase(oneSession).sessions = (firstCase(oneSession).sessions as unknown[]).slice(0, 1);
    await expect(writeExecutionEvidenceRun(oneSession)).rejects.toThrow(/exact fresh-a\/fresh-b/);

    const dirty = passOptions('20260716T120002Z_abcdef12_r1');
    const dirtySession = sessionAt(dirty, 1);
    (dirtySession.cleanup as Record<string, number>).listener = 1;
    await expect(writeExecutionEvidenceRun(dirty)).rejects.toThrow(/pass cleanup/);

    const fabricated = passOptions('20260716T120003Z_abcdef12_r1');
    const fabricatedAction = (sessionAt(fabricated, 0).actionResults as Record<string, unknown>[])[0];
    if (fabricatedAction === undefined) throw new Error('test action fixture missing');
    fabricatedAction.status = 'pass';
    await expect(writeExecutionEvidenceRun(fabricated)).rejects.toThrow(/action status/);

    const digestMismatch = passOptions('20260716T120004Z_abcdef12_r1');
    const digestSession = sessionAt(digestMismatch, 0);
    const mismatchedActual = structuredClone(digestSession.actual) as Record<string, unknown>;
    digestSession.actual = mismatchedActual;
    mismatchedActual.actualObservationSha256 = '0'.repeat(64);
    await expect(writeExecutionEvidenceRun(digestMismatch)).rejects.toThrow(/actual observation digest mismatch/);
  });

  it('preserves fail, not-implemented, and unsupported-environment without promotion', async () => {
    const options = passOptions('20260716T120005Z_abcdef12_r1');
    const base = firstCase(options);
    const statuses = [
      ['LIF-001', 'fail', 'assertion-mismatch'],
      ['LIF-002', 'not-implemented', 'handler-owner'],
      ['LIF-003', 'unsupported-environment', 'hardware-owner'],
    ] as const;
    options.cases = statuses.map(([caseId, result, blockedBy], index) => ({
      ...base,
      caseId,
      catalogBinding: catalogBinding(index, 'a'.repeat(64)),
      input: { ...caseInput(caseId), actionCount: 0 },
      sessions: [],
      result,
      blockedBy,
    }));

    const written = await writeExecutionEvidenceRun(options);
    const verified = await verifyExecutionResults(written.runDirectory, verificationOptionsFor(options, false));
    expect(verified.summary).toMatchObject({
      pass: 0,
      fail: 1,
      'not-implemented': 1,
      'unsupported-environment': 1,
    });
    expect(verified).toMatchObject({
      integrityVerified: true,
      catalogBindingVerified: true,
      packageArtifactVerified: false,
      executionPassed: false,
      verified: false,
      promotionVerified: false,
    });
  });

  it('detects evidence, sidecar, and actual-observation tampering offline', async () => {
    const evidenceOptions = passOptions('20260716T120006Z_abcdef12_r1');
    const evidenceRun = await writeExecutionEvidenceRun(evidenceOptions);
    const evidencePath = path.join(evidenceRun.runDirectory, 'cases/lif-001/evidence.json');
    const evidence = JSON.parse(await readFile(evidencePath, 'utf8')) as Record<string, unknown>;
    evidence.result = 'fail';
    await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
    await expect(verifyExecutionResults(
      evidenceRun.runDirectory,
      verificationOptionsFor(evidenceOptions),
    )).rejects.toThrow(/evidence digest mismatch/);

    const sidecarOptions = passOptions('20260716T120007Z_abcdef12_r1');
    const sidecarRun = await writeExecutionEvidenceRun(sidecarOptions);
    await writeFile(
      path.join(sidecarRun.runDirectory, 'cases/lif-001/evidence.json.sha256'),
      `${'0'.repeat(64)}  evidence.json\n`,
      'utf8',
    );
    await expect(verifyExecutionResults(
      sidecarRun.runDirectory,
      verificationOptionsFor(sidecarOptions),
    )).rejects.toThrow(/sidecar mismatch/);

    const actualOptions = passOptions('20260716T120008Z_abcdef12_r1');
    const actualRun = await writeExecutionEvidenceRun(actualOptions);
    const actualPath = path.join(actualRun.runDirectory, 'cases/lif-001/fresh-a.actual.json');
    const actual = JSON.parse(await readFile(actualPath, 'utf8')) as Record<string, unknown>;
    const actualObservation = actual.observation as Record<string, unknown>;
    (actualObservation.outcome as Record<string, unknown>).status = 'tampered';
    await writeFile(actualPath, `${JSON.stringify(actual, null, 2)}\n`, 'utf8');
    await expect(verifyExecutionResults(
      actualRun.runDirectory,
      verificationOptionsFor(actualOptions),
    )).rejects.toThrow(/actual .* digest mismatch/);
  });

  it('rejects structurally invalid non-pass evidence even after direct hashes are recomputed', async () => {
    const options = passOptions('20260716T120009Z_abcdef12_r1');
    const record = firstCase(options);
    record.sessions = [];
    record.input = { ...caseInput('LIF-001'), actionCount: 0 };
    record.result = 'fail';
    record.blockedBy = 'runner-owner';
    const written = await writeExecutionEvidenceRun(options);

    const evidencePath = path.join(written.runDirectory, 'cases/lif-001/evidence.json');
    const sidecarPath = path.join(written.runDirectory, 'cases/lif-001/evidence.json.sha256');
    const overlayPath = path.join(written.runDirectory, 'execution-manifest.json');
    const evidence = JSON.parse(await readFile(evidencePath, 'utf8')) as Record<string, unknown>;
    (evidence.input as Record<string, unknown>).route = '/lab/patch-map?scenario=LIF-001&size=500&seed=319';
    const evidenceBytes = `${JSON.stringify(evidence, null, 2)}\n`;
    const evidenceSha256 = sha256Bytes(evidenceBytes);
    await writeFile(evidencePath, evidenceBytes, 'utf8');
    await writeFile(sidecarPath, `${evidenceSha256}  evidence.json\n`, 'utf8');

    const overlay = JSON.parse(await readFile(overlayPath, 'utf8')) as Record<string, unknown>;
    const overlayRow = (overlay.cases as Record<string, unknown>[])[0];
    if (overlayRow === undefined) throw new Error('test overlay row missing');
    overlayRow.evidenceSha256 = evidenceSha256;
    await writeFile(overlayPath, `${JSON.stringify(overlay, null, 2)}\n`, 'utf8');

    await expect(verifyExecutionResults(
      written.runDirectory,
      verificationOptionsFor(options),
    )).rejects.toThrow(/canonical route/);
  });

  it('keeps the offline verifier free of implementation launch dependencies', async () => {
    const source = await readFile(
      fileURLToPath(new URL('../../scripts/verification/patch-map-contract/verify-results.mjs', import.meta.url)),
      'utf8',
    );
    expect(source).not.toMatch(/node:child_process|playwright|execute-worker|src\/patch-map|run\.mjs/);
  });
});
