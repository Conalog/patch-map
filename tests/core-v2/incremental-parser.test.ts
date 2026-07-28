import { describe, expect, it } from 'vitest';

import {
  parsePatchMapV010IncrementalFlat,
  parsePatchMapV010IncrementalStructure,
  primePatchMapV010IncrementalFlat,
} from '../../src/core-v2/incremental-parser';
import {
  parsePatchMapV010,
  parsePatchMapV010DirectTextBatch,
} from '../../src/core-v2/parser';
import {
  assembleOwnedCoreV2Dataset,
  materializeCoreV2Dataset,
} from '../../src/core-v2/semantic/dataset';
import {
  planCoreV2ParsedSceneReconcile,
  planCoreV2ParsedSceneReconcileStructuralWindow,
  planCoreV2SceneReconcile,
} from '../../src/core-v2/semantic/reconcile';
import {
  CORE_V2_MUTATION_TRANSACTION_REVISION,
  planCoreV2BulkPatch,
  planCoreV2MutationTransaction,
  planCoreV2TextBatch,
} from '../../src/core-v2/semantic/transaction';
import { buildCoreV2ContractPerformanceDataset } from '../../performance/core-v2/contract-workload';
import { buildCoreV2ManualScene } from '../../lab/performance-v2/interactive/manual-scene';

describe('Core v2 guarded incremental parser', () => {
  it('primes the stable flat indexes without changing parser output', () => {
    const current = materializeCoreV2Dataset([
      flatItem('item-1', 'Alpha'),
      {
        type: 'group',
        id: 'group',
        children: [flatRect('nested', 10)],
      },
      flatRect('rect-1', 20),
    ]);
    const parsed = parsePatchMapV010(current.dataset);
    const before = JSON.stringify(parsed);

    expect(primePatchMapV010IncrementalFlat(parsed)).toBe(true);
    expect(primePatchMapV010IncrementalFlat(parsed)).toBe(true);
    expect(JSON.stringify(parsed)).toBe(before);
    expect(primePatchMapV010IncrementalFlat(parsePatchMapV010([]))).toBe(false);
  });

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

  it('reuses unchanged hierarchy and relation roots around a dirty flat root', () => {
    const current = materializeCoreV2Dataset([
      {
        type: 'group',
        id: 'group',
        children: [
          {
            type: 'rect',
            id: 'nested',
            size: { width: 20, height: 20 },
            fill: '#ff8800',
          },
        ],
      },
      {
        type: 'relations',
        id: 'links',
        links: [{ source: 'nested', target: 'flat' }],
      },
      flatRect('flat', 20),
    ]);
    const plan = planCoreV2MutationTransaction(current, {
      strict: true,
      operations: [{
        op: 'merge',
        target: { kind: 'element', id: 'flat' },
        changes: [{ path: ['attrs', 'x'], value: 45 }],
      }],
    });
    expect(plan.status).toBe('planned');
    if (plan.status !== 'planned') throw new Error('mixed-root plan rejected');

    const previous = parsePatchMapV010(current.dataset);
    const incremental = parsePatchMapV010IncrementalFlat(
      plan.candidate.dataset,
      previous,
      ['flat'],
    );
    const canonical = parsePatchMapV010(plan.candidate.dataset);

    expect(incremental).not.toBeNull();
    expect(incremental).toEqual(canonical);
    expect(JSON.stringify(incremental)).toBe(JSON.stringify(canonical));
    expect(incremental?.identity.elements[0]).toBe(previous.identity.elements[0]);
    expect(incremental?.identity.elements[1]).toBe(previous.identity.elements[1]);
    expect(incremental?.projection.relationsByEntityId).toEqual(
      previous.projection.relationsByEntityId,
    );
  });

  it('directly re-projects text payloads exactly without parsing sibling geometry', () => {
    const current = materializeCoreV2Dataset([
      {
        type: 'item',
        id: 'item-1',
        size: { width: 180, height: 90 },
        padding: { top: 4, right: 8, bottom: 6, left: 10 },
        attrs: { x: 30, y: 40, angle: 12, scaleX: -1, scaleY: 1.25 },
        components: [
          {
            type: 'background',
            id: 'bg',
            source: { type: 'rect', fill: '#eef2ff' },
          },
          {
            type: 'text',
            id: 'label',
            text: 'Alpha',
            placement: 'right-bottom',
            margin: { x: 3, y: 5 },
            attrs: { x: 2, y: -1, angle: 7 },
            style: {
              fontFamily: 'Fira Code',
              fontSize: 15,
              lineHeight: 20,
              letterSpacing: 1,
              wordWrap: true,
              wordWrapWidth: 120,
              breakWords: true,
              fill: '#112233',
            },
          },
        ],
      },
      flatItem('item-2', 'Bravo'),
    ]);
    const plan = planCoreV2TextBatch(current, {
      targets: [
        { ownerId: 'item-1', componentId: 'label' },
        { ownerId: 'item-2', componentId: 'label' },
      ],
      texts: ['Changed text that wraps', 'Second changed'],
    });
    expect(plan.status).toBe('planned');
    if (plan.status !== 'planned') throw new Error('text batch plan rejected');
    const previous = parsePatchMapV010(current.dataset);
    const direct = parsePatchMapV010DirectTextBatch(
      plan.candidate.dataset,
      previous,
      plan.directTextUpdates ?? [],
    );
    const canonical = parsePatchMapV010(plan.candidate.dataset);

    expect(direct).not.toBeNull();
    expect(direct).toEqual(canonical);
    expect(JSON.stringify(direct)).toBe(JSON.stringify(canonical));
    expect(direct?.identity).toBe(previous.identity);
    expect(direct?.projection.componentsByEntityId)
      .toBe(previous.projection.componentsByEntityId);
  });

  it('stays exact for the 5,000-record manual Lab scene', () => {
    const current = materializeCoreV2Dataset(
      buildCoreV2ManualScene('5000', 319).dataset,
    );
    const plan = planCoreV2MutationTransaction(current, {
      strict: true,
      recordHistory: false,
      operations: [{
        op: 'merge',
        target: { kind: 'element', id: 'node-0' },
        changes: [
          { path: ['attrs', 'x'], value: 24 },
          { path: ['attrs', 'y'], value: 282 },
        ],
      }],
    });
    expect(plan.status).toBe('planned');
    if (plan.status !== 'planned') throw new Error('manual scene plan rejected');

    const previous = parsePatchMapV010(current.dataset);
    const incremental = parsePatchMapV010IncrementalFlat(
      plan.candidate.dataset,
      previous,
      ['node-0'],
    );
    const canonical = parsePatchMapV010(plan.candidate.dataset);

    expect(incremental).not.toBeNull();
    expect(incremental).toEqual(canonical);
  });

  it('stays canonical across owned top-level add, move, group, ungroup, and remove', () => {
    let current = materializeCoreV2Dataset([
      {
        type: 'relations',
        id: 'links',
        links: [{ source: 'rect-a', target: 'rect-b' }],
      },
      flatRect('rect-a', 10),
      flatRect('rect-b', 40),
      flatRect('rect-c', 70),
    ]);
    let previous = parsePatchMapV010(current.dataset);
    const requests = [
      {
        strict: true,
        operations: [{
          op: 'add',
          parent: null,
          collection: 'children',
          index: 2,
          value: flatRect('rect-d', 100),
        }],
      },
      {
        strict: true,
        operations: [{
          op: 'move',
          target: { kind: 'element', id: 'rect-c' },
          parent: null,
          index: 0,
        }],
      },
      {
        strict: true,
        operations: [{
          op: 'group',
          targets: [
            { kind: 'element', id: 'rect-a' },
            { kind: 'element', id: 'rect-b' },
          ],
          value: { type: 'group', id: 'group-ab' },
        }],
      },
      {
        strict: true,
        operations: [{
          op: 'ungroup',
          target: { kind: 'element', id: 'group-ab' },
          relationPolicy: 'reject',
        }],
      },
      {
        strict: true,
        operations: [{
          op: 'remove',
          target: { kind: 'element', id: 'rect-d' },
          cascade: 'subtree',
        }],
      },
    ] as const;

    for (const request of requests) {
      const sourceBefore = JSON.stringify(current.dataset);
      const plan = planCoreV2MutationTransaction(current, request);
      expect(plan.status).toBe('planned');
      if (plan.status !== 'planned') throw new Error('structural plan rejected');
      const incremental = parsePatchMapV010IncrementalStructure(
        plan.candidate.dataset,
        current.dataset,
        previous,
      );
      const canonical = parsePatchMapV010(plan.candidate.dataset);

      expect(incremental).not.toBeNull();
      expect(incremental).toEqual(canonical);
      expect(JSON.stringify(incremental)).toBe(JSON.stringify(canonical));
      const reconcileOptions = {
        ...(plan.selectionIds === undefined
          ? {}
          : { selectionIds: plan.selectionIds }),
        ...(plan.allowedElementOrderIds === undefined
          ? {}
          : { allowedRetainedOrderIds: plan.allowedElementOrderIds }),
      };
      expect(planCoreV2ParsedSceneReconcileStructuralWindow(
        previous.document,
        incremental!.document,
        reconcileOptions,
      )).toEqual(planCoreV2ParsedSceneReconcile(
        previous.document,
        canonical.document,
        reconcileOptions,
      ));
      expect(JSON.stringify(current.dataset)).toBe(sourceBefore);
      current = plan.candidate;
      previous = incremental!;
    }
  });

  it('reparses relation roots when a structural removal changes an endpoint', () => {
    const current = materializeCoreV2Dataset([
      flatRect('rect-a', 10),
      flatRect('rect-b', 40),
      {
        type: 'relations',
        id: 'links',
        links: [{ source: 'rect-a', target: 'rect-b' }],
      },
    ]);
    const plan = planCoreV2MutationTransaction(current, {
      strict: true,
      operations: [{
        op: 'remove',
        target: { kind: 'element', id: 'rect-a' },
        cascade: 'subtree',
      }],
    });
    expect(plan.status).toBe('planned');
    if (plan.status !== 'planned') throw new Error('remove plan rejected');
    const incremental = parsePatchMapV010IncrementalStructure(
      plan.candidate.dataset,
      current.dataset,
      parsePatchMapV010(current.dataset),
    );
    const canonical = parsePatchMapV010(plan.candidate.dataset);
    expect(incremental).toEqual(canonical);
    expect(JSON.stringify(incremental)).toBe(JSON.stringify(canonical));
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
