import { describe, expect, it } from 'vitest';

import {
  actualAt,
  captureValues,
  executeCase,
  isRecord,
  requireRecord,
  selectedCase,
} from './support/update-transactions-contract-runner';

describe('PatchMap UPD-007 atomic synthetic transaction contract', () => {
  it('publishes one valid transaction and rejects missing targets atomically', async () => {
    const plan = selectedCase('UPD-007');
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
      expect(requireRecord(actual.product, 'UPD-007 action product')).toHaveProperty('snapshot');
    }
    expect(actualAt(execution, 1)).toMatchObject({
      revisionDelta: 1,
      intermediatePublicationCount: 0,
      queryRevision: 2,
      eventRevision: 2,
      result: { history: { depthDelta: 1 } },
    });
    expect(captureValues(execution, 'valid')['frameRevision']).toBe(2);
    expect(actualAt(execution, 3)).toMatchObject({
      result: {
        status: 'rejected',
        transactionDiagnostic: { code: 'MISSING_TARGET' },
      },
      semanticHashUnchanged: true,
    });
  }, 20_000);
});
