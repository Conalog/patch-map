import { describe, expect, it } from 'vitest';

import { TransactionValidationFailure } from '../../src/patch-map/semantic/transaction/diagnostics';
import {
  EMPTY_OPERATIONS,
  normalizeBulkPatch,
  normalizeTransaction,
  targetKey,
  targetLabel,
} from '../../src/patch-map/semantic/transaction/request-normalization';

describe('PatchMap transaction request normalization', () => {
  it('detaches and freezes operation, target, path, value, and history inputs', () => {
    const path = ['attrs', 'meta'] as Array<string | number>;
    const value = { status: 'ready' };
    const history = { source: ['editor'] };
    const request = {
      operations: [{
        op: 'merge',
        target: { kind: 'component', ownerId: 'item-a', id: 'label' },
        changes: [{ path, value }],
      }],
      strict: true,
      history,
    };

    const normalized = normalizeTransaction(request);
    const operation = normalized.operations[0];
    if (operation?.op !== 'merge') throw new Error('expected normalized merge operation');
    const change = operation.changes[0];
    if (!change) throw new Error('expected normalized path change');

    path[0] = 'tampered';
    value.status = 'tampered';
    history.source[0] = 'tampered';

    expect(operation.target).toEqual({
      kind: 'component',
      ownerId: 'item-a',
      id: 'label',
    });
    expect(change).toEqual({ path: ['attrs', 'meta'], value: { status: 'ready' } });
    expect(normalized.history).toEqual({ source: ['editor'] });
    expect([
      normalized,
      normalized.operations,
      operation,
      operation.target,
      operation.changes,
      change,
      change.path,
      change.value,
      normalized.history,
    ].every(Object.isFrozen)).toBe(true);
    expect(targetKey(operation.target)).toBe('component:6:item-a:5:label');
    expect(targetLabel(operation.target)).toBe('component:item-a/label');
  });

  it.each([
    {
      name: 'request record',
      input: [],
      expected: { code: 'INVALID_VALUE', path: '$' },
    },
    {
      name: 'operation allowlist',
      input: {
        operations: [{
          op: 'merge',
          extra: true,
          target: { kind: 'element', id: 'box' },
          changes: [{ path: ['fill'], value: '#fff' }],
        }],
        strict: true,
      },
      expected: {
        code: 'UNKNOWN_FIELD',
        path: '$.operations[0].extra',
        operationIndex: 0,
      },
    },
    {
      name: 'target allowlist',
      input: {
        operations: [{
          op: 'merge',
          target: { kind: 'element', id: 'box', ownerId: 'invalid' },
          changes: [{ path: ['fill'], value: '#fff' }],
        }],
        strict: true,
      },
      expected: {
        code: 'UNKNOWN_FIELD',
        path: '$.operations[0].target.ownerId',
        operationIndex: 0,
      },
    },
    {
      name: 'unsafe path segment',
      input: {
        operations: [{
          op: 'merge',
          target: { kind: 'element', id: 'box' },
          changes: [{ path: ['__proto__'], value: '#fff' }],
        }],
        strict: true,
      },
      expected: {
        code: 'INVALID_PATH',
        path: '$.operations[0].changes[0].path[0]',
        operationIndex: 0,
      },
    },
  ])('preserves $name diagnostic order and location', ({ input, expected }) => {
    expect(normalizationDiagnostic(input)).toMatchObject(expected);
  });

  it('reuses the frozen empty operation atom for a validated empty bulk target set', () => {
    const normalized = normalizeBulkPatch({
      targets: [],
      changes: [{ path: ['fill'], value: '#fff' }],
      strict: true,
    });

    expect(normalized.operations).toBe(EMPTY_OPERATIONS);
    expect(Object.isFrozen(normalized.operations)).toBe(true);
  });
});

function normalizationDiagnostic(input: unknown) {
  try {
    normalizeTransaction(input);
  } catch (error) {
    if (error instanceof TransactionValidationFailure) return error.diagnostic;
    throw error;
  }
  throw new Error('expected request normalization to fail');
}
