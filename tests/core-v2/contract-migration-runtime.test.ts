import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  CORE_V2_MIGRATION_CASE_IDS,
  CORE_V2_MIGRATION_CLEANUP_REVISION,
  CORE_V2_MIGRATION_RUNTIME_REVISION,
  createCoreV2MigrationRuntime,
} from '../../lab/performance-v2/contract/migration-runtime';
import {
  materializeCoreV2ExecutableCase,
} from '../../lab/performance-v2/contract/executable-cases';
import {
  resolveCoreV2ExecutableRuntime,
} from '../../lab/performance-v2/contract/executable-runtime';

describe('Core v2 migration contract runtime', () => {
  it('keeps handlers and folds browser-safe and expected-blind', async () => {
    const [handlerSource, foldSource] = await Promise.all([
      readFile(fileURLToPath(new URL(
        '../../scripts/verification/core-v2-contract/handlers/migration.mjs',
        import.meta.url,
      )), 'utf8'),
      readFile(fileURLToPath(new URL(
        '../../scripts/verification/core-v2-contract/fold-migration.mjs',
        import.meta.url,
      )), 'utf8'),
    ]);
    const forbiddenEvidenceName = [
      'catalog',
      'normalized',
      'expected',
      'v1',
      'json',
    ].join('-');

    for (const source of [handlerSource, foldSource]) {
      expect(source).not.toContain(forbiddenEvidenceName);
      expect(source).not.toMatch(
        /from\s+['"][^'"]*(?:compare|observe)\.mjs['"]/u,
      );
      expect(source).not.toMatch(/node:/u);
      expect(source).not.toMatch(/^\s*import\s/mu);
    }
  });

  it.each(CORE_V2_MIGRATION_CASE_IDS)(
    'registers the exact approved action handlers for %s',
    (caseId) => {
      const plan = materializeCoreV2ExecutableCase(caseId, '100', 319);
      const runtime = resolveCoreV2ExecutableRuntime(caseId);
      const handlerIds = runtime.handlerEntries(plan).map(([id]) => id);

      expect(runtime.key).toBe('migration');
      expect(handlerIds).toEqual(
        plan.actionTrace.map(({ type }) => `contract/${type}`),
      );
      expect(new Set(handlerIds).size).toBe(handlerIds.length);
    },
  );

  it('owns compatibility and session authorities only until product cleanup', () => {
    const runtime = createCoreV2MigrationRuntime('MIG-002');
    const compatible = runtime.product.materializeDataset({
      kind: 'generic-item',
      id: 'legacy-a',
      width: 100,
      height: 80,
    });
    const authority = runtime.product.createAuthority('core-v2');
    authority.mountSession('cleanup-proof', {
      authoritative: 'core-v2',
      shadow: 'comparison',
      shadowMode: 'read-only',
    });

    expect(compatible).toMatchObject({
      sourceKind: 'legacy-generic-item',
      canonicalDataset: [{
        type: 'item',
        id: 'legacy-a',
        size: { width: 100, height: 80 },
        attrs: { x: 0, y: 0 },
      }],
    });
    expect(runtime.product.observeEngine).toBeTypeOf('function');
    expect(CORE_V2_MIGRATION_RUNTIME_REVISION)
      .toBe('core-v2-migration-runtime/1');
    expect(runtime.postDestroyProductProbe()).toEqual({
      revision: CORE_V2_MIGRATION_CLEANUP_REVISION,
      caseId: 'MIG-002',
      authorityCountBeforeDestroy: 1,
      retainedAuthorityCount: 0,
      retainedSessionCount: 0,
      retainedCallbackCount: 0,
    });
    expect(authority.probe()).toMatchObject({
      activeLifecycleCount: 0,
      canvasCount: 0,
      destroyed: true,
    });
    expect(() => runtime.product.createAuthority('core-v2')).toThrow(
      /after release/u,
    );
  });
});
