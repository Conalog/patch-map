import { describe, expect, it } from 'vitest';

// @ts-expect-error -- comparison-only verifier module is authored as ESM JavaScript.
import * as updateConflictActualsModule from '../../scripts/verification/core-v2-contract/update-conflict-actuals.mjs';

const {
  CORE_V2_UPDATE_CONFLICT_ACTUALS_REVISION,
  inspectCoreV2UpdateConflictActuals,
} = updateConflictActualsModule as {
  readonly CORE_V2_UPDATE_CONFLICT_ACTUALS_REVISION: string;
  readonly inspectCoreV2UpdateConflictActuals: (
    caseId: string,
    actualObservation: unknown,
  ) => readonly Readonly<Record<string, unknown>>[];
};

describe('Core v2 update immutable-conflict actual pins', () => {
  it('accepts only the exact product diagnostics and revisions already disclosed', () => {
    expect(CORE_V2_UPDATE_CONFLICT_ACTUALS_REVISION)
      .toBe('core-v2-update-conflict-actuals/1');
    expect(inspectCoreV2UpdateConflictActuals('UPD-003', {
      outcome: { invalidCrossScope: { code: 'INVALID_RECORD_KIND' } },
    })).toEqual([]);
    expect(inspectCoreV2UpdateConflictActuals('UPD-007', {
      outcome: { valid: { queryRevision: 2, eventRevision: 2 } },
    })).toEqual([]);
  });

  it('rejects arbitrary replacement diagnostics and revision-domain drift', () => {
    expect(inspectCoreV2UpdateConflictActuals('UPD-003', {
      outcome: { invalidCrossScope: { code: 'ARBITRARY_DIAGNOSTIC' } },
    })).toEqual([
      expect.objectContaining({
        path: '/outcome/invalidCrossScope/code',
        expectedActual: 'INVALID_RECORD_KIND',
        observedActual: 'ARBITRARY_DIAGNOSTIC',
        status: 'value-mismatch',
      }),
    ]);
    expect(inspectCoreV2UpdateConflictActuals('UPD-007', {
      outcome: { valid: { queryRevision: 1 } },
    })).toEqual([
      expect.objectContaining({ path: '/outcome/valid/queryRevision', status: 'value-mismatch' }),
      expect.objectContaining({ path: '/outcome/valid/eventRevision', status: 'unresolved' }),
    ]);
  });

  it('does not impose update pins on unrelated cases', () => {
    expect(inspectCoreV2UpdateConflictActuals('REN-005', {})).toEqual([]);
  });
});
