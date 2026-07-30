import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import packageConsumerEvidence from '../../performance/patch-map/results/package-consumer.json';
import {
  PATCH_MAP_PACKAGE_INTEGRATION_CASE_IDS,
  PATCH_MAP_PACKAGE_INTEGRATION_RUNTIME_REVISION,
  createPatchMapPackageIntegrationRuntime,
} from '../../lab/patch-map/contract/package-integration-runtime';
// @ts-expect-error -- browser-safe contract handlers are authored as ESM JavaScript.
import * as handlerModule from '../../scripts/verification/core-v2-contract/handlers/package-integration.mjs';
// @ts-expect-error -- browser-safe contract folds are authored as ESM JavaScript.
import * as foldModule from '../../scripts/verification/core-v2-contract/fold-package-integration.mjs';

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

const handlers = handlerModule as unknown as PackageHandlerRuntime;
const fold = foldModule as unknown as PackageFoldRuntime;
const packedProvenance = packageConsumerEvidence.provenance;

describe('PatchMap packed integration automation substrate', () => {
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
        '../../lab/patch-map/contract/package-integration-runtime.ts',
        import.meta.url,
      ),
      new URL(
        '../../scripts/verification/core-v2-contract/handlers/package-integration.mjs',
        import.meta.url,
      ),
      new URL(
        '../../scripts/verification/core-v2-contract/fold-package-integration.mjs',
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
