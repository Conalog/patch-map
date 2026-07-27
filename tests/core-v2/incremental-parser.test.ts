import { describe, expect, it } from 'vitest';

import { parsePatchMapV010IncrementalFlat } from '../../src/core-v2/incremental-parser';
import { parsePatchMapV010 } from '../../src/core-v2/parser';
import {
  assembleOwnedCoreV2Dataset,
  materializeCoreV2Dataset,
} from '../../src/core-v2/semantic/dataset';
import {
  planCoreV2ParsedSceneReconcile,
  planCoreV2SceneReconcile,
} from '../../src/core-v2/semantic/reconcile';
import {
  CORE_V2_MUTATION_TRANSACTION_REVISION,
  planCoreV2BulkPatch,
  planCoreV2MutationTransaction,
} from '../../src/core-v2/semantic/transaction';
import { buildCoreV2ContractPerformanceDataset } from '../../performance/core-v2/contract-workload';

describe('Core v2 guarded incremental parser', () => {
  it('is exact for dirty flat roots while reusing untouched parser records', () => {
    const current = materializeCoreV2Dataset(
      buildCoreV2ContractPerformanceDataset(100, 319),
    );
    const plan = planCoreV2BulkPatch(
      current,
      {
        strict: true,
        actionId: 'incremental-parser-exact',
        targets: [
          { kind: 'element', id: 'node-10' },
          { kind: 'element', id: 'node-70' },
        ],
        changes: [{ path: ['attrs', 'angle'], value: 7 }],
      },
      CORE_V2_MUTATION_TRANSACTION_REVISION,
    );
    expect(plan.status).toBe('planned');
    if (plan.status !== 'planned') throw new Error('bulk plan rejected');
    expect(plan.candidate.dataset[0]).toBe(current.dataset[0]);
    expect(plan.candidate.dataset[10]).not.toBe(current.dataset[10]);
    expect(plan.candidate.dataset[11]).toBe(current.dataset[11]);
    expect(plan.candidate.semanticHash).toBe(
      materializeCoreV2Dataset(plan.candidate.dataset).semanticHash,
    );

    const previous = parsePatchMapV010(current.dataset);
    const incremental = parsePatchMapV010IncrementalFlat(
      plan.candidate.dataset,
      previous,
      ['node-10', 'node-70'],
    );
    const canonical = parsePatchMapV010(plan.candidate.dataset);

    expect(incremental).not.toBeNull();
    expect(incremental).toEqual(canonical);
    expect(JSON.stringify(incremental)).toBe(JSON.stringify(canonical));
    expect(incremental?.identity.elements[0]).toBe(previous.identity.elements[0]);
    expect(incremental?.identity.elements[10]).not.toBe(previous.identity.elements[10]);
    expect(incremental?.identity.elements[10]?.sourcePath).toBe('$[10]');
    expect(Object.isFrozen(incremental?.projection.byEntityId ?? null)).toBe(true);
    expect(
      planCoreV2ParsedSceneReconcile(previous.document, canonical.document),
    ).toEqual(
      planCoreV2SceneReconcile(previous.document, canonical.document),
    );
  });

  it('falls back when a dirty root is missing or the scene is not flat', () => {
    const flat = materializeCoreV2Dataset(
      buildCoreV2ContractPerformanceDataset(100, 319),
    );
    const parsedFlat = parsePatchMapV010(flat.dataset);
    expect(
      parsePatchMapV010IncrementalFlat(flat.dataset, parsedFlat, ['missing-root']),
    ).toBeNull();

    const nested = materializeCoreV2Dataset([{
      type: 'group',
      id: 'group',
      children: [{
        type: 'rect',
        id: 'child',
        size: { width: 10, height: 10 },
        fill: '#ffffff',
      }],
    }]).dataset;
    expect(
      parsePatchMapV010IncrementalFlat(
        nested,
        parsePatchMapV010(nested),
        ['group'],
      ),
    ).toBeNull();
  });

  it('matches the canonical parser across mixed flat root and component changes', () => {
    const current = materializeCoreV2Dataset([
      flatItem('item-1', 'Alpha'),
      flatItem('item-2', 'Beta'),
      flatRect('rect-1', 10),
      flatRect('rect-2', 20),
      { type: 'text', id: 'text-1', text: 'First' },
      { type: 'text', id: 'text-2', text: 'Second' },
      {
        type: 'image',
        id: 'image-1',
        source: 'https://example.invalid/image-1.png',
        size: { width: 20, height: 20 },
      },
      {
        type: 'image',
        id: 'image-2',
        source: 'https://example.invalid/image-2.png',
        size: { width: 20, height: 20 },
      },
    ]);
    const plan = planCoreV2MutationTransaction(current, {
      strict: true,
      operations: [
        {
          op: 'merge',
          target: { kind: 'component', ownerId: 'item-1', id: 'label' },
          changes: [{ path: ['text'], value: 'Updated' }],
        },
        {
          op: 'merge',
          target: { kind: 'element', id: 'rect-1' },
          changes: [{ path: ['attrs', 'x'], value: 35 }],
        },
        {
          op: 'merge',
          target: { kind: 'element', id: 'text-1' },
          changes: [{ path: ['text'], value: 'Changed' }],
        },
      ],
    });
    expect(plan.status).toBe('planned');
    if (plan.status !== 'planned') throw new Error('mixed flat plan rejected');

    const previous = parsePatchMapV010(current.dataset);
    const incremental = parsePatchMapV010IncrementalFlat(
      plan.candidate.dataset,
      previous,
      ['item-1', 'rect-1', 'text-1'],
    );
    const canonical = parsePatchMapV010(plan.candidate.dataset);

    expect(incremental).toEqual(canonical);
    expect(JSON.stringify(incremental)).toBe(JSON.stringify(canonical));
    expect(plan.candidate.dataset[1]).toBe(current.dataset[1]);
    expect(plan.candidate.dataset[3]).toBe(current.dataset[3]);
    expect(plan.candidate.dataset[7]).toBe(current.dataset[7]);
  });

  it('rejects shallow-frozen roots that do not come from the materializer', () => {
    const current = materializeCoreV2Dataset(
      buildCoreV2ContractPerformanceDataset(100, 319),
    );
    const spoofed = Object.freeze({
      ...current.dataset[0]!,
      attrs: { angle: 17 },
    });
    const roots = [...current.dataset];
    roots[0] = spoofed;

    expect(() => assembleOwnedCoreV2Dataset(current, roots))
      .toThrow('not materializer-owned');
  });
});

function flatItem(id: string, text: string): Readonly<Record<string, unknown>> {
  return {
    type: 'item',
    id,
    size: { width: 100, height: 80 },
    components: [{ type: 'text', id: 'label', text }],
  };
}

function flatRect(id: string, x: number): Readonly<Record<string, unknown>> {
  return {
    type: 'rect',
    id,
    size: { width: 20, height: 20 },
    fill: '#336699',
    attrs: { x },
  };
}
