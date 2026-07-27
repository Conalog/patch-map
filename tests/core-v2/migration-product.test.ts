import { describe, expect, it, vi } from 'vitest';

import {
  CORE_V2_MIGRATION_BLOCKERS,
  CORE_V2_MIGRATION_COHORTS,
  CORE_V2_MIGRATION_EFFECTS,
  CORE_V2_MIGRATION_REVISION,
  CoreV2MigrationAuthority,
  CoreV2MigrationError,
  assertCoreV2SemanticRoundtrip,
  materializeCoreV2CompatibilityDataset,
  materializeCoreV2Dataset,
  prepareCoreV2PersistenceExport,
} from '../../src/core-v2';

describe('Core v2 migration compatibility boundary', () => {
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
    const result = materializeCoreV2CompatibilityDataset(legacy);
    const canonical = [{
      type: 'item',
      id: 'legacy-a',
      label: 'Legacy A',
      size: { width: 100, height: 80 },
      attrs: { x: 10, y: 20 },
    }];

    expect(result).toMatchObject({
      revision: CORE_V2_MIGRATION_REVISION,
      sourceKind: 'legacy-generic-item',
      canonicalDataset: canonical,
    });
    expect(result.semanticHash).toBe(
      materializeCoreV2Dataset(canonical).semanticHash,
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

    expect(() => materializeCoreV2CompatibilityDataset(malformed)).toThrowError(
      expect.objectContaining({
        name: 'CoreV2MigrationError',
        code: 'INVALID_LEGACY_ROOT',
        datasetPath: '$.height',
      }),
    );
    expect(() => materializeCoreV2Dataset({
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
    const exported = prepareCoreV2PersistenceExport(canonical);
    const reloaded = materializeCoreV2CompatibilityDataset(
      JSON.parse(exported.serialized) as unknown,
    );

    expect(exported).toMatchObject({
      revision: CORE_V2_MIGRATION_REVISION,
      rootKind: 'array',
    });
    expect(Array.isArray(exported.dataset)).toBe(true);
    expect(reloaded.semanticHash).toBe(exported.semanticHash);
    expect(() => assertCoreV2SemanticRoundtrip(exported, reloaded)).not.toThrow();

    const invalid = structuredClone(canonical) as Array<Record<string, unknown>>;
    invalid[0] = {
      ...invalid[0],
      attrs: {
        x: 10,
        y: 15,
        bad: (): void => undefined,
      },
    };
    expect(() => prepareCoreV2PersistenceExport(invalid)).toThrowError(
      expect.objectContaining({
        code: 'NON_SERIALIZABLE_VALUE',
        datasetPath: '$[0].attrs.bad',
      }),
    );
    expect(() => prepareCoreV2PersistenceExport({ dataset: canonical }))
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

    expect(() => prepareCoreV2PersistenceExport(candidate)).toThrowError(
      expect.objectContaining({
        code: 'NON_SERIALIZABLE_VALUE',
        datasetPath: '$[0].attrs.x',
      }),
    );
    expect(getter).not.toHaveBeenCalled();
  });

  it('detects semantic mismatches explicitly', () => {
    expect(() => assertCoreV2SemanticRoundtrip(
      { semanticHash: 'fnv1a64:0000000000000000' },
      { semanticHash: 'fnv1a64:1111111111111111' },
    )).toThrowError(expect.objectContaining({
      code: 'SEMANTIC_MISMATCH',
      datasetPath: '$',
    }));
  });
});

describe('Core v2 migration session authority', () => {
  it('publishes authoritative effects once and suppresses every shadow user effect', () => {
    const authority = new CoreV2MigrationAuthority();
    authority.mountSession('canary-1', {
      authoritative: 'core-v2',
      shadow: 'comparison',
      shadowMode: 'read-only',
    });

    for (const effect of CORE_V2_MIGRATION_EFFECTS) {
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
      cohortsPercent: CORE_V2_MIGRATION_COHORTS,
      guardedBlockers: CORE_V2_MIGRATION_BLOCKERS,
    });

    expect(cohort).toEqual({
      guardedBlockers: CORE_V2_MIGRATION_BLOCKERS,
      failures: [],
      completedCohorts: CORE_V2_MIGRATION_COHORTS,
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
      authoritativeEffectCount: CORE_V2_MIGRATION_EFFECTS.length,
      shadowEffectCount: 0,
      suppressedShadowEffectCount: CORE_V2_MIGRATION_EFFECTS.length,
    });
  });

  it.each(CORE_V2_MIGRATION_BLOCKERS)(
    'stops promotion when %s is observed',
    (blocker) => {
      const authority = new CoreV2MigrationAuthority();
      const cohort = authority.evaluateCanary({
        cohortsPercent: CORE_V2_MIGRATION_COHORTS,
        guardedBlockers: CORE_V2_MIGRATION_BLOCKERS,
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
    const authority = new CoreV2MigrationAuthority('core-v2');
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
    const authority = new CoreV2MigrationAuthority();
    expect(() => authority.mountSession('bad-shadow', {
      authoritative: 'core-v2',
      shadow: 'comparison',
    })).toThrow(/explicitly read-only/u);
    expect(() => authority.evaluateCanary({
      cohortsPercent: [1, 50, 10, 100],
      guardedBlockers: CORE_V2_MIGRATION_BLOCKERS,
    })).toThrow(/migration cohorts/u);
    expect(() => new CoreV2MigrationError(
      'NON_SERIALIZABLE_VALUE',
      '$.value',
      'test',
    )).not.toThrow();
  });
});
