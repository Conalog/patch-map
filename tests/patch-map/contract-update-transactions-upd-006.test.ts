import { describe, expect, it, vi } from 'vitest';

import { PatchMap } from '../../src/patch-map/engine';
import {
  actualAt,
  executeCase,
  isRecord,
  requireRecord,
  selectedCase,
} from './support/update-transactions-contract-runner';

describe('PatchMap UPD-006 bulk patch contract', () => {
  it('executes against public PatchMap state without mutating action inputs', async () => {
    const plan = selectedCase('UPD-006');
    const before = JSON.stringify(plan);
    const execution = await executeCase(plan);

    expect(execution.status).toBe('completed');
    expect(execution.eventJournalFailures).toEqual([]);
    expect(execution.cleanup).toMatchObject({ status: 'completed', errors: [] });
    expect(execution.actionResults).toHaveLength(plan.actionTrace.length);
    expect(execution.actionResults.every(({ status }) => status === 'completed')).toBe(true);
    expect(JSON.stringify(plan)).toBe(before);
    for (const result of execution.actionResults) {
      const actual = result.delta.actual;
      if (isRecord(actual.input)) expect(actual.input).toMatchObject({ unchanged: true });
      expect(requireRecord(actual.product, 'UPD-006 action product')).toHaveProperty('snapshot');
    }
    expect(actualAt(execution, 0).result).toMatchObject({
      applied: [],
      missing: [{ id: 'missing' }],
    });
    expect(actualAt(execution, 1).result).toMatchObject({
      applied: [{ id: 'rect-b' }],
      missing: [{ id: 'missing' }],
    });
    expect(actualAt(execution, 2)).toMatchObject({
      revisionDelta: 0,
      result: { status: 'unchanged', applied: [] },
    });
    expect(actualAt(execution, 3).result).toMatchObject({
      status: 'rejected',
      transactionDiagnostic: { code: 'MISSING_TARGET' },
    });
  }, 20_000);

  it('routes all target sets, including the empty set, through Engine.bulkPatch()', async () => {
    const bulkPatch = vi.spyOn(PatchMap.prototype, 'bulkPatch');
    try {
      const execution = await executeCase(selectedCase('UPD-006'));
      expect(execution.status).toBe('completed');
      expect(bulkPatch).toHaveBeenCalledTimes(4);
      expect(bulkPatch.mock.calls[2]?.[0]).toMatchObject({
        strict: true,
        targets: [],
        changes: [{ path: ['attrs', 'x'], value: 200 }],
      });
      expect(actualAt(execution, 2)).toMatchObject({
        revisionDelta: 0,
        result: { status: 'unchanged', changed: false, applied: [] },
      });
    } finally {
      bulkPatch.mockRestore();
    }
  });
});
