import { describe, expect, it, vi } from 'vitest';

import {
  PATCH_MAP_MIGRATION_BLOCKERS,
  PATCH_MAP_MIGRATION_COHORTS,
  PATCH_MAP_MIGRATION_EFFECTS,
  PATCH_MAP_MIGRATION_REVISION,
  PatchMapMigrationAuthority,
  PatchMapMigrationError,
  assertPatchMapSemanticRoundtrip,
  materializePatchMapCompatibilityDataset,
  materializePatchMapDataset,
  preparePatchMapPersistenceExport,
} from '../../src/patch-map';

describe('PatchMap migration compatibility boundary', () => {
  it('normalizes the pinned legacy root without mutating or retaining caller input', () => {
    const legacy = {
      kind: 'generic-item',
      id: 'legacy-a',
      x: 10,
      y: 20,
      width: 100,
      height: 80,
      label: 'Legacy A',
    };
    const before = structuredClone(legacy);
    const result = materializePatchMapCompatibilityDataset(legacy);
    const canonical = [{
      type: 'item',
      id: 'legacy-a',
      label: 'Legacy A',
      size: { width: 100, height: 80 },
      attrs: { x: 10, y: 20 },
    }];

    expect(result).toMatchObject({
      revision: PATCH_MAP_MIGRATION_REVISION,
      sourceKind: 'legacy-generic-item',
      canonicalDataset: canonical,
    });
    expect(result.semanticHash).toBe(
      materializePatchMapDataset(canonical).semanticHash,
    );
    expect(legacy).toEqual(before);
    legacy.x = 999;
    expect(result.canonicalDataset).toEqual(canonical);
    expect(Object.isFrozen(result.canonicalDataset)).toBe(true);
    expect(Object.isFrozen(result.canonicalDataset[0])).toBe(true);
  });

  it('keeps strict array materialization closed while diagnosing malformed legacy paths', () => {
    const malformed = {
      kind: 'generic-item',
      id: 'broken',
      width: 100,
    };

    expect(() => materializePatchMapCompatibilityDataset(malformed)).toThrowError(
      expect.objectContaining({
        name: 'PatchMapMigrationError',
        code: 'INVALID_LEGACY_ROOT',
        datasetPath: '$.height',
      }),
    );
    expect(() => materializePatchMapDataset({
      kind: 'generic-item',
      id: 'legacy-a',
      width: 100,
      height: 80,
    })).toThrowError(expect.objectContaining({
      code: 'INVALID_VALUE',
      datasetPath: '$',
    }));
  });

  it('guards array-root export, strict reload, and nonserializable values before writes', () => {
    const canonical = [{
      type: 'rect',
      id: 'rect-a',
      size: { width: 40, height: 20 },
      attrs: { x: 10, y: 15 },
    }];
    const exported = preparePatchMapPersistenceExport(canonical);
    const reloaded = materializePatchMapCompatibilityDataset(
      JSON.parse(exported.serialized) as unknown,
    );

    expect(exported).toMatchObject({
      revision: PATCH_MAP_MIGRATION_REVISION,
      rootKind: 'array',
    });
    expect(Array.isArray(exported.dataset)).toBe(true);
    expect(reloaded.semanticHash).toBe(exported.semanticHash);
    expect(() => assertPatchMapSemanticRoundtrip(exported, reloaded)).not.toThrow();

    const invalid = structuredClone(canonical) as Array<Record<string, unknown>>;
    invalid[0] = {
      ...invalid[0],
      attrs: {
        x: 10,
        y: 15,
        bad: (): void => undefined,
      },
    };
    expect(() => preparePatchMapPersistenceExport(invalid)).toThrowError(
      expect.objectContaining({
        code: 'NON_SERIALIZABLE_VALUE',
        datasetPath: '$[0].attrs.bad',
      }),
    );
    expect(() => preparePatchMapPersistenceExport({ dataset: canonical }))
      .toThrowError(expect.objectContaining({
        code: 'INVALID_EXPORT_ROOT',
        datasetPath: '$',
      }));
  });

  it('rejects accessors without executing caller code', () => {
    const getter = vi.fn(() => 10);
    const attrs = Object.defineProperty({}, 'x', {
      enumerable: true,
      get: getter,
    });
    const candidate = [{
      type: 'rect',
      id: 'rect-a',
      size: { width: 40, height: 20 },
      attrs,
    }];

    expect(() => preparePatchMapPersistenceExport(candidate)).toThrowError(
      expect.objectContaining({
        code: 'NON_SERIALIZABLE_VALUE',
        datasetPath: '$[0].attrs.x',
      }),
    );
    expect(getter).not.toHaveBeenCalled();
  });

  it('detects semantic mismatches explicitly', () => {
    expect(() => assertPatchMapSemanticRoundtrip(
      { semanticHash: 'fnv1a64:0000000000000000' },
      { semanticHash: 'fnv1a64:1111111111111111' },
    )).toThrowError(expect.objectContaining({
      code: 'SEMANTIC_MISMATCH',
      datasetPath: '$',
    }));
  });
});

describe('PatchMap migration session authority', () => {
  it('publishes authoritative effects once and suppresses every shadow user effect', () => {
    const authority = new PatchMapMigrationAuthority();
    authority.mountSession('canary-1', {
      authoritative: 'core-v2',
      shadow: 'comparison',
      shadowMode: 'read-only',
    });

    for (const effect of PATCH_MAP_MIGRATION_EFFECTS) {
      expect(authority.recordEffect('authoritative', effect)).toMatchObject({
        published: true,
        suppressed: false,
      });
      expect(authority.recordEffect('shadow', effect)).toMatchObject({
        published: false,
        suppressed: true,
      });
    }
    const cohort = authority.evaluateCanary({
      cohortsPercent: PATCH_MAP_MIGRATION_COHORTS,
      guardedBlockers: PATCH_MAP_MIGRATION_BLOCKERS,
    });

    expect(cohort).toEqual({
      guardedBlockers: PATCH_MAP_MIGRATION_BLOCKERS,
      failures: [],
      completedCohorts: PATCH_MAP_MIGRATION_COHORTS,
      stoppedAtPercent: null,
      promotionAllowed: true,
    });
    expect(authority.probe()).toMatchObject({
      activeEngine: 'core-v2',
      shadowEngine: 'comparison',
      shadowMode: 'read-only',
      activeLifecycleCount: 1,
      activeCanvasesPerHostSlot: 1,
      shadowCanvasCount: 0,
      authoritativeEngineCountPerSession: 1,
      authoritativeEffectCount: PATCH_MAP_MIGRATION_EFFECTS.length,
      shadowEffectCount: 0,
      suppressedShadowEffectCount: PATCH_MAP_MIGRATION_EFFECTS.length,
    });
  });

  it.each(PATCH_MAP_MIGRATION_BLOCKERS)(
    'stops promotion when %s is observed',
    (blocker) => {
      const authority = new PatchMapMigrationAuthority();
      const cohort = authority.evaluateCanary({
        cohortsPercent: PATCH_MAP_MIGRATION_COHORTS,
        guardedBlockers: PATCH_MAP_MIGRATION_BLOCKERS,
        failures: [blocker],
      });

      expect(cohort).toMatchObject({
        failures: [blocker],
        completedCohorts: [],
        stoppedAtPercent: 1,
        promotionAllowed: false,
      });
    },
  );

  it('keeps an active session stable and applies rollback only at remount', () => {
    const authority = new PatchMapMigrationAuthority('core-v2');
    authority.mountSession('before-rollback');
    authority.beginGesture('drag-1');
    authority.recordTriggerState('idle');
    authority.recordTriggerState('load-failure');
    authority.recordTriggerState('update');
    authority.recordTriggerState('gesture');
    const pending = authority.requestRollback({
      from: 'core-v2',
      to: 'previous',
      effectiveAt: 'next-remount',
    });

    expect(pending).toMatchObject({
      activeEngine: 'core-v2',
      desiredEngine: 'previous',
      rollbackPending: true,
      activeSessionHotSwapCount: 0,
      activeGestureCount: 1,
    });

    authority.recordTriggerState('remount');
    expect(authority.remountSession('after-rollback')).toMatchObject({
      activeEngine: 'previous',
      desiredEngine: 'previous',
      rollbackPending: false,
      activeLifecycleCount: 1,
      canvasCount: 1,
      activeSessionHotSwapCount: 0,
      activeGestureCount: 0,
      staleGestureCount: 0,
      replayedGestureCount: 0,
    });

    expect(authority.destroy()).toBe(true);
    expect(authority.destroy()).toBe(false);
    expect(authority.probe()).toMatchObject({
      activeLifecycleCount: 0,
      canvasCount: 0,
      retainedCallbackCount: 0,
      destroyed: true,
    });
    expect(() => authority.mountSession('late')).toThrow(
      /migration authority is destroyed/u,
    );
  });

  it('rejects invalid cohort order and writable shadow mounts', () => {
    const authority = new PatchMapMigrationAuthority();
    expect(() => authority.mountSession('bad-shadow', {
      authoritative: 'core-v2',
      shadow: 'comparison',
    })).toThrow(/explicitly read-only/u);
    expect(() => authority.evaluateCanary({
      cohortsPercent: [1, 50, 10, 100],
      guardedBlockers: PATCH_MAP_MIGRATION_BLOCKERS,
    })).toThrow(/migration cohorts/u);
    expect(() => new PatchMapMigrationError(
      'NON_SERIALIZABLE_VALUE',
      '$.value',
      'test',
    )).not.toThrow();
  });
});
