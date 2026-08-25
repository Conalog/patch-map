import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import packageConsumerEvidence from '../../contracts/evidence/qualification/package-consumer.json';
import {
  PATCH_MAP_PACKAGE_INTEGRATION_CASE_IDS,
  PATCH_MAP_PACKAGE_INTEGRATION_RUNTIME_REVISION,
  createPatchMapPackageIntegrationRuntime,
} from '../../lab/contract/package-integration-runtime';
// @ts-expect-error -- browser-safe contract handlers are authored as ESM JavaScript.
import * as handlerModule from '../../verification/contract/handlers/package-integration.mjs';
// @ts-expect-error -- browser-safe contract folds are authored as ESM JavaScript.
import * as foldModule from '../../verification/contract/fold-package-integration.mjs';
// @ts-expect-error -- package artifact policy is authored as ESM JavaScript.
import * as artifactPolicyModule from '../../verification/package/artifact-policy.mjs';
// @ts-expect-error -- package evidence collectors are authored as ESM JavaScript.
import * as packageEvidenceModule from '../../verification/package/evidence.mjs';

interface PackageHandlerRuntime {
  readonly PACKAGE_INTEGRATION_HANDLER_REVISION: string;
  readonly PACKAGE_INTEGRATION_CASE_IDS: readonly string[];
  readonly PACKAGE_INTEGRATION_ACTION_TYPES: readonly string[];
  createPackageIntegrationHandlerEntries(
    this: void,
    product: Readonly<Record<string, unknown>>,
  ): readonly (readonly [string, (...args: unknown[]) => unknown])[];
}

interface PackageFoldRuntime {
  readonly PACKAGE_INTEGRATION_FOLD_REVISION: string;
  foldPackageIntegrationExecution(this: void, options: unknown): unknown;
}

interface ArtifactPolicyRuntime {
  readonly PUBLIC_DOCS: readonly string[];
  projectPackedArtifactPolicy(
    this: void,
    options: Readonly<{
      packRecord: Readonly<{
        filename: string;
        size: number;
        unpackedSize: number;
      }>;
      files: readonly string[];
      sha256: string;
    }>,
  ): Readonly<{
    publicDocs: readonly string[];
    missingDocs: readonly string[];
    unexpectedDocs: readonly string[];
    restrictedEvidence: readonly string[];
  }>;
}

interface PackageEvidenceRuntime {
  collectPackagePublicationFailures(
    this: void,
    packageArtifact: Readonly<{
      missingDocs: readonly string[];
      missingExamples: readonly string[];
      unexpectedDocs: readonly string[];
    }>,
  ): readonly string[];
}

const handlers = handlerModule as unknown as PackageHandlerRuntime;
const fold = foldModule as unknown as PackageFoldRuntime;
const artifactPolicy = artifactPolicyModule as unknown as ArtifactPolicyRuntime;
const packageEvidence = packageEvidenceModule as unknown as PackageEvidenceRuntime;
const packedProvenance = packageConsumerEvidence.provenance;

describe('PatchMap packed integration automation substrate', () => {
  it('pins the exact upstream Fira Code 6.2 license', async () => {
    const license = await readFile(
      new URL('../../docs/assets/fira-code-6.2-license.txt', import.meta.url),
    );
    expect(createHash('sha256').update(license).digest('hex'))
      .toBe('1d41e10031ab125302780a05ec4c91d218e47db0c7e37cf315cce5e608cdc25c');
  });

  it('keeps package verifier owned modules loadable and explicitly composed', async () => {
    const urls = [
      new URL('../../verification/package/run.mjs', import.meta.url),
      new URL(
        '../../verification/package/consumer-sources.mjs',
        import.meta.url,
      ),
      new URL(
        '../../verification/package/evidence.mjs',
        import.meta.url,
      ),
      new URL(
        '../../verification/package/supply-chain.mjs',
        import.meta.url,
      ),
      new URL('../../verification/package/matrix.mjs', import.meta.url),
      new URL(
        '../../verification/package/artifact-policy.mjs',
        import.meta.url,
      ),
      new URL(
        '../../verification/package/journey-comparison.mjs',
        import.meta.url,
      ),
      new URL(
        '../../verification/package/runner-sources.mjs',
        import.meta.url,
      ),
    ];
    const paths = urls.map((url) => fileURLToPath(url));
    const sources = await Promise.all(paths.map((path) => readFile(path, 'utf8')));
    for (const path of paths) {
      const checked = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8' });
      expect(checked.status).toBe(0);
      expect(checked.stderr).toBe('');
    }

    const root = sources[0]!;
    const consumers = sources[1]!;
    const evidence = sources[2]!;
    const supplyChain = sources[3]!;
    const matrix = sources[4]!;
    const artifact = sources[5]!;
    const comparison = sources[6]!;
    const runners = sources[7]!;
    expect(root).toContain("from './consumer-sources.mjs'");
    expect(root).toContain('createPackedConsumerDependencySeedPackageJson');
    expect(root).toContain("'--prefer-offline'");
    expect(root).toContain("'--offline'");
    expect(root).toContain("from './evidence.mjs'");
    expect(root).toContain("from './supply-chain.mjs'");
    expect(consumers).toContain('export const PACKED_CONSUMER_ESM_SOURCE = `');
    expect(consumers).toContain('export const PACKED_CONSUMER_CJS_SOURCE = `');
    expect(consumers).toContain(
      'export function createPackedConsumerDependencySeedPackageJson()',
    );
    expect(evidence).toContain('export function collectPackageFailures');
    expect(evidence).toContain('export function createPackageConsumerEvidence');
    expect(supplyChain).toContain('export function createSupplyChainEvidence');
    expect(supplyChain).toContain("format: 'patch-map-spdx-lite/1'");
    expect(matrix).toContain("from './artifact-policy.mjs'");
    expect(matrix).toContain("from './journey-comparison.mjs'");
    expect(matrix).toContain("from './runner-sources.mjs'");
    expect(artifact).toContain("export const PACKAGE_NAME = '@conalog/patch-map';");
    expect(artifact).toContain("'docs/assets/fonts.md'");
    expect(artifact).toContain("'docs/assets/fira-code-6.2-license.txt'");
    expect(artifact).not.toContain('clean-?room');
    expect(comparison).toContain('export function comparePackedJourneyRuns');
    expect(comparison).toContain('countDestroySummaryFailures(run.destroySummary)');
    expect(runners).toContain('export function journeyRunnerSource');
  });

  it('owns an exact public documentation package manifest', () => {
    expect(artifactPolicy.PUBLIC_DOCS).toEqual([
      'docs/README.md',
      'docs/getting-started.md',
      'docs/api/data-and-targets.md',
      'docs/api/mutations-and-history.md',
      'docs/api/pointer-and-selection.md',
      'docs/api/viewport-and-transform.md',
      'docs/api/presentation.md',
      'docs/api/assets-and-capture.md',
      'docs/api/text.md',
      'docs/integration/host.md',
      'docs/compatibility.md',
      'docs/assets/fonts.md',
      'docs/assets/fira-code-6.2-license.txt',
    ]);

    const files = [
      'dist/index.js',
      ...artifactPolicy.PUBLIC_DOCS,
      'examples/host-adapter.ts',
      'examples/minimal.ts',
      'examples/dashboard.ts',
      'examples/editor.ts',
      'examples/report.ts',
      'examples/presentation.ts',
      'docs/internal.md',
      'contracts/contract.json',
      'docs/engineering/private.md',
      'fixtures/private.json',
      'verification/evidence/extraction/result.json',
    ];
    const projected = artifactPolicy.projectPackedArtifactPolicy({
      packRecord: {
        filename: 'conalog-patch-map-1.0.0-alpha.2.tgz',
        size: 1,
        unpackedSize: 1,
      },
      files,
      sha256: 'a'.repeat(64),
    });

    expect(projected.publicDocs).toEqual(artifactPolicy.PUBLIC_DOCS);
    expect(projected.missingDocs).toEqual([]);
    expect(projected.unexpectedDocs).toEqual([
      'docs/internal.md',
      'docs/engineering/private.md',
    ]);
    expect(projected.restrictedEvidence).toEqual([
      'contracts/contract.json',
      'docs/engineering/private.md',
      'fixtures/private.json',
      'verification/evidence/extraction/result.json',
    ]);
  });

  it('fails package publication for missing or unexpected documentation', () => {
    expect(packageEvidence.collectPackagePublicationFailures({
      missingDocs: [],
      missingExamples: [],
      unexpectedDocs: [],
    })).toEqual([]);
    expect(packageEvidence.collectPackagePublicationFailures({
      missingDocs: ['docs/api/text.md'],
      missingExamples: [],
      unexpectedDocs: ['docs/engineering/private.md'],
    })).toEqual([
      'packed artifact is missing public PatchMap docs or examples',
      'packed artifact contains unexpected public documentation',
    ]);
  });

  it('withholds the documentation digest when the package contains an unowned doc', async () => {
    const digest = 'a'.repeat(64);
    const evidence = {
      schemaVersion: 2,
      status: 'pass',
      failures: [],
      package: '@conalog/patch-map',
      pixi: '8.19.0',
      provenance: { packedPackageSha256: digest },
      environment: {},
      errors: { console: [], page: [], network: [] },
      artifact: {
        sha256: digest,
        sourceMapCount: 0,
        restrictedEvidenceCount: 0,
        missingDocs: [],
        unexpectedDocs: ['docs/private.md'],
        publicDocs: artifactPolicy.PUBLIC_DOCS,
        missingExamples: [],
      },
      examples: {
        compiledExamples: ['minimal'],
        executedExamples: ['minimal'],
        results: [{ name: 'minimal', status: 'pass' }],
      },
      types: { strict: true, exactOptionalPropertyTypes: true, exitCode: 0 },
    };
    const entries = new Map(handlers.createPackageIntegrationHandlerEntries({
      readPackedConsumerEvidence: () => evidence,
    }));
    const validateDocumentation = entries.get('contract/validate-documentation-digest');
    expect(validateDocumentation).toBeTypeOf('function');
    const resolveDataset = () => Promise.reject(new Error('must not resolve'));
    const result = await validateDocumentation!(
      {
        caseId: 'PKG-005',
        actionIndex: 2,
        createEngine: () => Promise.reject(new Error('must not create engine')),
        releaseEngine: () => Promise.resolve(),
        resolveDataset,
        fingerprint: () => '',
        fixtureParams: {},
        signal: { aborted: false },
        clock: { now: () => 0 },
      },
      {
        index: 2,
        type: 'validate-documentation-digest',
        operands: { expectedPackageDigest: 'provenance.packedPackageSha256' },
      },
    ) as Readonly<{ actual: Readonly<{ documentationDigest: string | null }> }>;

    expect(result.actual.documentationDigest).toBeNull();
  });

  it('registers five cases through one collision-free shared handler family', () => {
    expect(PATCH_MAP_PACKAGE_INTEGRATION_RUNTIME_REVISION)
      .toBe('patch-map-package-integration-runtime/1');
    expect(PATCH_MAP_PACKAGE_INTEGRATION_CASE_IDS).toEqual([
      'PKG-001',
      'PKG-002',
      'PKG-003',
      'PKG-004',
      'PKG-005',
    ]);
    expect(handlers.PACKAGE_INTEGRATION_HANDLER_REVISION)
      .toBe('patch-map-package-integration-handlers/1');
    expect(handlers.PACKAGE_INTEGRATION_CASE_IDS)
      .toEqual(PATCH_MAP_PACKAGE_INTEGRATION_CASE_IDS);
    expect(handlers.PACKAGE_INTEGRATION_ACTION_TYPES).toEqual([
      'build-package',
      'pack-package',
      'install-offline-consumer',
      'run-consumer-flow',
      'run-redesigned-host-adapter',
      'initialize-instances',
      'mutate-instance',
      'destroy-instance',
      'recreate-instance',
      'install-packed-artifact',
      'run-host-journey-matrix',
      'compile-public-examples',
      'run-public-examples',
      'validate-documentation-digest',
    ]);

    const runtime = createPatchMapPackageIntegrationRuntime();
    const entries = handlers.createPackageIntegrationHandlerEntries(
      runtime.product as unknown as Readonly<Record<string, unknown>>,
    );
    expect(entries.map(([id]) => id)).toEqual(
      handlers.PACKAGE_INTEGRATION_ACTION_TYPES.map((type) => `contract/${type}`),
    );
    expect(new Set(entries.map(([id]) => id)).size).toBe(entries.length);
  });

  it('rejects undeclared host-adapter operands at the handler boundary', async () => {
    const runtime = createPatchMapPackageIntegrationRuntime();
    const entries = new Map(handlers.createPackageIntegrationHandlerEntries(
      runtime.product as unknown as Readonly<Record<string, unknown>>,
    ));
    const runAdapter = entries.get('contract/run-redesigned-host-adapter');
    expect(runAdapter).toBeTypeOf('function');
    await expect(runAdapter!(
      {
        caseId: 'PKG-002',
        actionIndex: 0,
        createEngine: () => Promise.reject(new Error('must not create engine')),
        releaseEngine: () => Promise.resolve(),
        resolveDataset: () => Promise.reject(new Error('must not resolve dataset')),
        fingerprint: () => '',
        fixtureParams: {},
        signal: { aborted: false },
        clock: { now: () => 0 },
      },
      {
        index: 0,
        type: 'run-redesigned-host-adapter',
        operands: { capabilities: ['load'], removedAlias: [] },
      },
    )).rejects.toThrow('run-redesigned-host-adapter operands keys');
  });

  it('returns detached immutable packed proof snapshots', () => {
    const runtime = createPatchMapPackageIntegrationRuntime();
    const first = runtime.product.readPackedConsumerEvidence();
    const second = runtime.product.readPackedConsumerEvidence();

    expect(first).not.toBe(second);
    expect(first).toEqual(second);
    expect(Object.isFrozen(first)).toBe(true);
    expect(first).toMatchObject({
      schemaVersion: 2,
      status: 'pass',
      provenance: {
        codeCommit: packedProvenance.codeCommit,
        packedPackageSha256: packedProvenance.packedPackageSha256,
        expectedEvidenceBound: true,
        promotionEligible: false,
        evidenceClassification: 'retained-historical-package-proof',
        shippingPackageName: '@conalog/patch-map',
        evidencePackageName: '@conalog/patch-map',
        packageIdentityMatchesShipping: true,
      },
      packageMatrix: {
        remainingCanvasCount: 0,
      },
    });
    expect(packedProvenance.codeCommit).toMatch(/^[0-9a-f]{40}$/u);
    expect(packedProvenance.packedPackageSha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(packageConsumerEvidence.artifact.sha256)
      .toBe(packedProvenance.packedPackageSha256);
    expect(packageConsumerEvidence.supplyChain.sourceRevision)
      .toBe(packedProvenance.codeCommit);
  });

  it('keeps product transport, handlers, and fold outside the expected/comparator boundary', async () => {
    const urls = [
      new URL(
        '../../lab/contract/package-integration-runtime.ts',
        import.meta.url,
      ),
      new URL(
        '../../verification/contract/handlers/package-integration.mjs',
        import.meta.url,
      ),
      new URL(
        '../../verification/contract/fold-package-integration.mjs',
        import.meta.url,
      ),
    ];
    const source = (await Promise.all(urls.map((url) => readFile(url, 'utf8')))).join('\n');

    expect(fold.PACKAGE_INTEGRATION_FOLD_REVISION)
      .toBe('patch-map-package-integration-fold/1');
    expect(typeof fold.foldPackageIntegrationExecution).toBe('function');
    expect(source).not.toMatch(
      /catalog-normalized-expected|normalizedExpected|approvedExpected|compareObservation|expectedCase/u,
    );
    expect(source).not.toMatch(/node:fs|readFile/u);
  });
});
