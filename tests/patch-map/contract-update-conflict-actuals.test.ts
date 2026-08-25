import { describe, expect, it } from 'vitest';

// @ts-expect-error -- comparison-only verifier module is authored as ESM JavaScript.
import * as updateConflictActualsModule from '../../scripts/verification/patch-map-contract/update-conflict-actuals.mjs';

const {
  PATCH_MAP_UPDATE_CONFLICT_ACTUALS_REVISION,
  inspectPatchMapUpdateConflictActuals,
} = updateConflictActualsModule as {
  readonly PATCH_MAP_UPDATE_CONFLICT_ACTUALS_REVISION: string;
  readonly inspectPatchMapUpdateConflictActuals: (
    caseId: string,
    actualObservation: unknown,
  ) => readonly Readonly<Record<string, unknown>>[];
};

describe('PatchMap immutable-conflict actual pins', () => {
  it('accepts only the exact product diagnostics, revisions, and readable orientations disclosed', () => {
    expect(PATCH_MAP_UPDATE_CONFLICT_ACTUALS_REVISION)
      .toBe('patch-map-update-conflict-actuals/2');
    expect(inspectPatchMapUpdateConflictActuals('LAY-004', {
      text: { upright: { screenAngle: { at90: 270 } } },
      geometry: {
        orientationMatrix: Array.from({ length: 10 }, () => ({})).concat({
          screenBasis: [0.390731, 0.920505, -0.920505, 0.390731],
        }),
      },
    })).toEqual([]);
    expect(inspectPatchMapUpdateConflictActuals('REN-011', {
      text: { contractMatrix: Array.from({ length: 6 }, () => ({})).concat({
        screenAngle: 37,
      }) },
      geometry: { texts: { upright: { screenAngle: 37 } } },
      outcome: { textContractMatrix: { allRowsExact: false } },
    })).toEqual([]);
    expect(inspectPatchMapUpdateConflictActuals('UPD-003', {
      outcome: { invalidCrossScope: { code: 'INVALID_RECORD_KIND' } },
    })).toEqual([]);
    expect(inspectPatchMapUpdateConflictActuals('UPD-007', {
      outcome: { valid: { queryRevision: 2, eventRevision: 2 } },
    })).toEqual([]);
    expect(inspectPatchMapUpdateConflictActuals('UPD-009', {
      outcome: { cycle: { code: 'CONFLICT' } },
    })).toEqual([]);
  });

  it('rejects arbitrary replacement diagnostics and revision-domain drift', () => {
    expect(inspectPatchMapUpdateConflictActuals('LAY-004', {
      text: { upright: { screenAngle: { at90: 0 } } },
      geometry: { orientationMatrix: [] },
    })).toEqual([
      expect.objectContaining({
        path: '/text/upright/screenAngle/at90',
        expectedActual: 270,
        observedActual: 0,
        status: 'value-mismatch',
      }),
      expect.objectContaining({
        path: '/geometry/orientationMatrix/10/screenBasis',
        status: 'unresolved',
      }),
    ]);
    expect(inspectPatchMapUpdateConflictActuals('REN-011', {
      text: { contractMatrix: Array.from({ length: 7 }, () => ({ screenAngle: 0 })) },
      geometry: { texts: { upright: { screenAngle: 0 } } },
      outcome: { textContractMatrix: { allRowsExact: true } },
    })).toHaveLength(3);
    expect(inspectPatchMapUpdateConflictActuals('UPD-003', {
      outcome: { invalidCrossScope: { code: 'ARBITRARY_DIAGNOSTIC' } },
    })).toEqual([
      expect.objectContaining({
        path: '/outcome/invalidCrossScope/code',
        expectedActual: 'INVALID_RECORD_KIND',
        observedActual: 'ARBITRARY_DIAGNOSTIC',
        status: 'value-mismatch',
      }),
    ]);
    expect(inspectPatchMapUpdateConflictActuals('UPD-007', {
      outcome: { valid: { queryRevision: 1 } },
    })).toEqual([
      expect.objectContaining({ path: '/outcome/valid/queryRevision', status: 'value-mismatch' }),
      expect.objectContaining({ path: '/outcome/valid/eventRevision', status: 'unresolved' }),
    ]);
    expect(inspectPatchMapUpdateConflictActuals('UPD-009', {
      outcome: { cycle: { code: 'ARBITRARY_DIAGNOSTIC' } },
    })).toEqual([
      expect.objectContaining({
        path: '/outcome/cycle/code',
        expectedActual: 'CONFLICT',
        observedActual: 'ARBITRARY_DIAGNOSTIC',
        status: 'value-mismatch',
      }),
    ]);
  });

  it('does not impose update pins on unrelated cases', () => {
    expect(inspectPatchMapUpdateConflictActuals('REN-005', {})).toEqual([]);
  });
});
