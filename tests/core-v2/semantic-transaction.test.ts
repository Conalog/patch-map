import { describe, expect, it } from 'vitest';

import {
  materializeCoreV2Dataset,
  type CoreV2Component,
  type CoreV2Element,
  type CoreV2ItemElement,
  type MaterializedCoreV2Dataset,
} from '../../src/core-v2/semantic/dataset';
import {
  CORE_V2_MUTATION_TRANSACTION_REVISION,
  planCoreV2BarHeightBatch,
  planCoreV2BulkPatch,
  planCoreV2MutationTransaction,
  planCoreV2TextBatch,
} from '../../src/core-v2/semantic/transaction';
import {
  CORE_V2_IDENTITY_AFFINE,
  createCoreV2Affine,
  multiplyCoreV2Affine,
  type CoreV2AffineMatrix,
} from '../../src/core-v2/semantic/geometry';

describe('Core v2 staged semantic transaction planner', () => {
  it('plans a compact typed-array bar batch without mutating caller input', () => {
    const current = materializeCoreV2Dataset([
      {
        type: 'item',
        id: 'item-a',
        size: { width: 100, height: 80 },
        components: [barComponent('bar-a', '#2563ebff')],
      },
      {
        type: 'item',
        id: 'item-b',
        size: { width: 100, height: 80 },
        components: [barComponent('bar-b', '#ef4444ff')],
      },
    ]);
    const targets = Object.freeze([
      Object.freeze({ ownerId: 'item-a', componentId: 'bar-a' }),
      Object.freeze({ ownerId: 'item-b', componentId: 'bar-b' }),
    ]);
    const heights = new Float64Array([42, 10]);
    const before = JSON.stringify(current);

    const result = planCoreV2BarHeightBatch(current, {
      targets,
      heights,
      actionId: 'compact-bars',
    });

    expect(result.status).toBe('planned');
    if (result.status !== 'planned') throw new Error('Expected planned bar batch');
    expect(result).toMatchObject({
      changed: true,
      actionId: 'compact-bars',
      operations: [],
      applied: [{ kind: 'component', ownerId: 'item-a', id: 'bar-a' }],
      unchanged: [{ kind: 'component', ownerId: 'item-b', id: 'bar-b' }],
      summary: { appliedCount: 1, missingCount: 0, unchangedCount: 1 },
      directBarHeightUpdates: [
        { ownerId: 'item-a', componentId: 'bar-a', height: 42 },
      ],
    });
    expect(requireComponent(result.candidate, 'item-a', 'bar-a'))
      .toMatchObject({ size: { width: 60, height: 42 } });
    expect(JSON.stringify(current)).toBe(before);
    expect(targets).toEqual([
      { ownerId: 'item-a', componentId: 'bar-a' },
      { ownerId: 'item-b', componentId: 'bar-b' },
    ]);
    expect([...heights]).toEqual([42, 10]);
  });

  it('rejects a late missing or duplicate compact bar target atomically', () => {
    const current = materializeCoreV2Dataset([{
      type: 'item',
      id: 'item-a',
      size: { width: 100, height: 80 },
      components: [barComponent('bar-a', '#2563ebff')],
    }]);

    for (const request of [
      {
        targets: [
          { ownerId: 'item-a', componentId: 'bar-a' },
          { ownerId: 'missing', componentId: 'bar' },
        ],
        heights: new Float64Array([42, 18]),
      },
      {
        targets: [
          { ownerId: 'item-a', componentId: 'bar-a' },
          { ownerId: 'item-a', componentId: 'bar-a' },
        ],
        heights: new Float64Array([42, 18]),
      },
    ]) {
      const result = planCoreV2BarHeightBatch(current, request);
      expect(result).toMatchObject({
        status: 'rejected',
        changed: false,
        candidate: null,
      });
      expect(current.semanticHash).toBe(
        materializeCoreV2Dataset(current.dataset).semanticHash,
      );
      expect(requireComponent(current, 'item-a', 'bar-a'))
        .toMatchObject({ size: { height: 10 } });
    }
  });

  it('plans a compact text batch with structural sharing and atomic rejection', () => {
    const current = materializeCoreV2Dataset([
      {
        type: 'item',
        id: 'item-a',
        size: { width: 100, height: 80 },
        components: [
          barComponent('bar-a', '#2563ebff'),
          textComponent('label-a', 'Alpha'),
        ],
      },
      {
        type: 'item',
        id: 'item-b',
        size: { width: 100, height: 80 },
        components: [textComponent('label-b', 'Bravo')],
      },
    ]);
    const targets = Object.freeze([
      Object.freeze({ ownerId: 'item-a', componentId: 'label-a' }),
      Object.freeze({ ownerId: 'item-b', componentId: 'label-b' }),
    ]);
    const texts = Object.freeze(['Changed', 'Bravo']);
    const before = JSON.stringify(current);

    const result = planCoreV2TextBatch(current, {
      targets,
      texts,
      actionId: 'compact-texts',
    });

    expect(result.status).toBe('planned');
    if (result.status !== 'planned') throw new Error('Expected planned text batch');
    expect(result).toMatchObject({
      changed: true,
      actionId: 'compact-texts',
      operations: [],
      applied: [{ kind: 'component', ownerId: 'item-a', id: 'label-a' }],
      unchanged: [{ kind: 'component', ownerId: 'item-b', id: 'label-b' }],
      summary: { appliedCount: 1, missingCount: 0, unchangedCount: 1 },
      directTextUpdates: [
        { ownerId: 'item-a', componentId: 'label-a', text: 'Changed' },
      ],
    });
    expect(requireComponent(result.candidate, 'item-a', 'label-a'))
      .toMatchObject({ text: 'Changed' });
    expect(result.candidate.dataset[1]).toBe(current.dataset[1]);
    expect(JSON.stringify(current)).toBe(before);
    expect(targets).toEqual([
      { ownerId: 'item-a', componentId: 'label-a' },
      { ownerId: 'item-b', componentId: 'label-b' },
    ]);
    expect(texts).toEqual(['Changed', 'Bravo']);

    const rejected = planCoreV2TextBatch(current, {
      targets: [
        { ownerId: 'item-a', componentId: 'label-a' },
        { ownerId: 'missing', componentId: 'label' },
      ],
      texts: ['Tentative', 'Never published'],
    });
    expect(rejected).toMatchObject({
      status: 'rejected',
      changed: false,
      candidate: null,
      diagnostic: { code: 'MISSING_TARGET', operationIndex: 1 },
    });
    expect(requireComponent(current, 'item-a', 'label-a'))
      .toMatchObject({ text: 'Alpha' });
  });

  it('runs ordered nested merges against one detached staged candidate', () => {
    const current = makeScene();
    const before = JSON.stringify(current);
    const request = {
      strict: true,
      actionId: 'bulk-1',
      conflictPolicy: 'reject',
      recordHistory: true,
      history: { selectedIds: ['item-a'] },
      operations: [
        {
          op: 'merge',
          target: componentTarget('item-a', 'bar'),
          changes: [
            { path: ['size'], value: { height: 30 } },
            { path: ['attrs', 'telemetry'], value: { sample: 2 } },
            { path: ['attrs', 'tags'], value: ['next'] },
          ],
        },
        {
          op: 'merge',
          target: componentTarget('item-a', 'bar'),
          changes: [{ path: ['size', 'width'], value: 70 }],
        },
      ],
    };
    const requestBefore = JSON.stringify(request);

    const result = planCoreV2MutationTransaction(current, request);

    expect(result.status).toBe('planned');
    if (result.status !== 'planned') throw new Error('Expected planned transaction');
    expect(result).toMatchObject({
      changed: true,
      schemaRevision: CORE_V2_MUTATION_TRANSACTION_REVISION,
      strict: true,
      actionId: 'bulk-1',
      conflictPolicy: 'reject',
      recordHistory: true,
      applied: [componentTarget('item-a', 'bar')],
      missing: [],
      unchanged: [],
      summary: { appliedCount: 1, missingCount: 0, unchangedCount: 0 },
    });
    expect(requireComponent(result.candidate, 'item-a', 'bar')).toMatchObject({
      id: 'bar',
      type: 'bar',
      size: { width: 70, height: 30 },
      source: { fill: '#2563ebff' },
      attrs: { telemetry: { enabled: true, sample: 2 }, tags: ['next'] },
    });
    expect(result.history).toEqual({ selectedIds: ['item-a'] });
    expect(Object.isFrozen(result.history)).toBe(true);
    expect(JSON.stringify(current)).toBe(before);
    expect(JSON.stringify(request)).toBe(requestBefore);

    request.history.selectedIds.push('caller-mutation');
    request.operations[0]?.changes[0]?.value satisfies unknown;
    expect(result.history).toEqual({ selectedIds: ['item-a'] });
  });

  it('replaces arrays as whole values and classifies a no-op target once', () => {
    const current = makeScene();
    const result = planCoreV2MutationTransaction(current, {
      strict: true,
      operations: [
        {
          op: 'merge',
          target: elementTarget('rect-b'),
          changes: [{ path: ['attrs', 'tags'], value: ['first', 'second'] }],
        },
        {
          op: 'merge',
          target: elementTarget('rect-b'),
          changes: [{ path: ['attrs', 'tags'], value: ['only'] }],
        },
        {
          op: 'merge',
          target: elementTarget('item-a'),
          changes: [],
        },
      ],
    });

    expect(result.status).toBe('planned');
    if (result.status !== 'planned') throw new Error('Expected planned transaction');
    expect(requireElement(result.candidate.dataset, 'rect-b').attrs?.tags).toEqual(['only']);
    expect(result.applied).toEqual([elementTarget('rect-b')]);
    expect(result.unchanged).toEqual([elementTarget('item-a')]);
    expect(result.summary).toEqual({ appliedCount: 1, missingCount: 0, unchangedCount: 1 });
  });

  it('rolls back every staged change on a late strict missing target', () => {
    const current = makeScene();
    const currentHash = current.semanticHash;
    const result = planCoreV2MutationTransaction(current, {
      strict: true,
      operations: [
        merge(elementTarget('rect-b'), ['attrs', 'x'], 200),
        merge(elementTarget('missing'), ['attrs', 'x'], 1),
      ],
    });

    expect(result).toMatchObject({
      status: 'rejected',
      changed: false,
      candidate: null,
      applied: [],
      missing: [],
      unchanged: [],
      summary: { appliedCount: 0, missingCount: 0, unchangedCount: 0 },
      diagnostic: {
        code: 'MISSING_TARGET',
        category: 'MISSING_TARGET',
        operationIndex: 1,
        target: elementTarget('missing'),
      },
    });
    expect(current.semanticHash).toBe(currentHash);
    expect(requireElement(current.dataset, 'rect-b').attrs?.x).toBe(160);
  });

  it('records permissive missing targets while committing existing targets atomically', () => {
    const result = planCoreV2MutationTransaction(makeScene(), {
      strict: false,
      operations: [
        merge(elementTarget('missing-a'), ['attrs', 'x'], 1),
        merge(elementTarget('rect-b'), ['attrs', 'x'], 180),
        merge(elementTarget('missing-b'), ['attrs', 'x'], 2),
        merge(elementTarget('missing-a'), ['attrs', 'x'], 3),
      ],
    });

    expect(result.status).toBe('planned');
    if (result.status !== 'planned') throw new Error('Expected permissive plan');
    expect(result.applied).toEqual([elementTarget('rect-b')]);
    expect(result.missing).toEqual([elementTarget('missing-a'), elementTarget('missing-b')]);
    expect(result.summary).toEqual({ appliedCount: 1, missingCount: 2, unchangedCount: 0 });
    expect(requireElement(result.candidate.dataset, 'rect-b').attrs?.x).toBe(180);
  });

  it.each([
    {
      name: 'duplicate paths',
      changes: [
        { path: ['attrs', 'x'], value: 1 },
        { path: ['attrs', 'x'], value: 2 },
      ],
    },
    {
      name: 'prefix-overlapping paths',
      changes: [
        { path: ['attrs'], value: { x: 1 } },
        { path: ['attrs', 'x'], value: 2 },
      ],
    },
  ])('rejects $name before staging', ({ changes }) => {
    const result = planCoreV2MutationTransaction(makeScene(), {
      strict: true,
      operations: [{ op: 'merge', target: elementTarget('rect-b'), changes }],
    });

    expect(result).toMatchObject({
      status: 'rejected',
      diagnostic: { code: 'OVERLAPPING_PATH', category: 'INVALID_INPUT' },
      summary: { appliedCount: 0, missingCount: 0, unchangedCount: 0 },
    });
  });

  it.each([
    { path: [], code: 'INVALID_PATH' },
    { path: ['id'], code: 'INVALID_PATH' },
    { path: ['type'], code: 'INVALID_PATH' },
    { path: ['attrs', '__proto__'], code: 'INVALID_PATH' },
    { path: ['attrs', -1], code: 'INVALID_PATH' },
    { path: ['attrs', 1.5], code: 'INVALID_PATH' },
  ])('rejects invalid merge path $path', ({ path, code }) => {
    const result = planCoreV2MutationTransaction(makeScene(), {
      strict: true,
      operations: [
        {
          op: 'merge',
          target: elementTarget('rect-b'),
          changes: [{ path, value: 1 }],
        },
      ],
    });

    expect(result).toMatchObject({ status: 'rejected', diagnostic: { code } });
  });

  it('rejects unknown envelope fields, empty transactions, and non-serializable values', () => {
    const unknown = planCoreV2MutationTransaction(makeScene(), {
      strict: true,
      operations: [merge(elementTarget('rect-b'), ['attrs', 'x'], 1)],
      surprise: true,
    });
    const empty = planCoreV2MutationTransaction(makeScene(), { strict: true, operations: [] });
    const nonFinite = planCoreV2MutationTransaction(makeScene(), {
      strict: true,
      operations: [merge(elementTarget('rect-b'), ['attrs', 'x'], Number.NaN)],
    });

    expect(unknown).toMatchObject({ status: 'rejected', diagnostic: { code: 'UNKNOWN_FIELD' } });
    expect(empty).toMatchObject({ status: 'rejected', diagnostic: { code: 'INVALID_MUTATION' } });
    expect(nonFinite).toMatchObject({
      status: 'rejected',
      diagnostic: { code: 'NON_SERIALIZABLE_VALUE' },
    });
  });

  it('validates an empty bulk target set as a detached product no-op', () => {
    const current = makeScene();
    const request = Object.freeze({
      strict: true,
      actionId: 'empty-target-set',
      targets: Object.freeze([]),
      changes: Object.freeze([
        Object.freeze({ path: Object.freeze(['attrs', 'x']), value: 200 }),
      ]),
    });

    const result = planCoreV2BulkPatch(current, request);

    expect(result).toMatchObject({
      status: 'planned',
      changed: false,
      actionId: 'empty-target-set',
      operations: [],
      applied: [],
      missing: [],
      unchanged: [],
      summary: { appliedCount: 0, missingCount: 0, unchangedCount: 0 },
    });
    expect(result.status === 'planned' ? result.candidate : null).toBe(current);
    expect(planCoreV2BulkPatch(current, {
      strict: true,
      targets: [],
      changes: [{ path: ['__proto__'], value: 1 }],
    })).toMatchObject({
      status: 'rejected',
      diagnostic: { code: 'INVALID_PATH' },
    });
  });

  it('rejects engine-style handles instead of treating them as logical targets', () => {
    const result = planCoreV2MutationTransaction(makeScene(), {
      strict: true,
      operations: [
        {
          op: 'merge',
          target: { kind: 'element', id: 'rect-b', lifecycleGeneration: 1 },
          changes: [{ path: ['attrs', 'x'], value: 200 }],
        },
      ],
    });

    expect(result).toMatchObject({
      status: 'rejected',
      diagnostic: { code: 'UNKNOWN_FIELD', path: '$.operations[0].target.lifecycleGeneration' },
    });
  });

  it('replaces complete element records within element scope and preserves target identity', () => {
    const result = planCoreV2MutationTransaction(makeScene(), {
      strict: true,
      operations: [
        {
          op: 'replace',
          target: elementTarget('rect-b'),
          value: {
            type: 'text',
            text: 'Replaced',
            size: { width: 60, height: 20 },
          },
        },
        merge(elementTarget('rect-b'), ['text'], 'Updated'),
      ],
    });

    expect(result.status).toBe('planned');
    if (result.status !== 'planned') throw new Error('Expected replacement plan');
    expect(requireElement(result.candidate.dataset, 'rect-b')).toMatchObject({
      type: 'text',
      id: 'rect-b',
      text: 'Updated',
      show: true,
      locked: false,
      size: { width: 60, height: 20 },
    });
    expect(result.applied).toEqual([elementTarget('rect-b')]);
  });

  it('rejects replacement identity conflicts and cross-scope discriminators', () => {
    const identityConflict = planCoreV2MutationTransaction(makeScene(), {
      strict: true,
      operations: [
        {
          op: 'replace',
          target: elementTarget('rect-b'),
          value: { type: 'rect', id: 'other', size: { width: 1, height: 1 } },
        },
      ],
    });
    const crossScope = planCoreV2MutationTransaction(makeScene(), {
      strict: true,
      operations: [
        {
          op: 'replace',
          target: elementTarget('rect-b'),
          value: { type: 'bar', id: 'rect-b' },
        },
      ],
    });

    expect(identityConflict).toMatchObject({
      status: 'rejected',
      diagnostic: { code: 'CONFLICTING_FIELDS' },
    });
    expect(crossScope).toMatchObject({
      status: 'rejected',
      diagnostic: { code: 'INVALID_RECORD_KIND' },
    });
  });

  it('replaces component discriminators only inside the addressed owner scope', () => {
    const result = planCoreV2MutationTransaction(makeScene(), {
      strict: true,
      operations: [
        {
          op: 'replace',
          target: componentTarget('item-a', 'bar'),
          value: {
            type: 'text',
            text: 'Now text',
            placement: 'center',
            style: { fontFamily: 'Inter', fontSize: 12, fill: '#111111' },
          },
        },
      ],
    });

    expect(result.status).toBe('planned');
    if (result.status !== 'planned') throw new Error('Expected component replacement plan');
    expect(requireComponent(result.candidate, 'item-a', 'bar')).toMatchObject({
      type: 'text',
      id: 'bar',
      text: 'Now text',
    });
    expect(requireComponent(result.candidate, 'item-b', 'bar').type).toBe('bar');
  });

  it('reconciles components authoritatively, preserves supplied order, and exposes new targets', () => {
    const labelInput = textComponent('label', 'Alpha');
    const components = [
      labelInput,
      barComponent('bar', '#00aa66'),
      backgroundComponent('bg', '#336699'),
      textComponent('status', 'Ready'),
    ];
    const inputBefore = JSON.stringify(components);
    const result = planCoreV2MutationTransaction(makeScene(), {
      strict: true,
      operations: [
        {
          op: 'reconcile-components',
          target: elementTarget('item-a'),
          components,
        },
        merge(componentTarget('item-a', 'status'), ['text'], 'Running'),
      ],
    });

    expect(result.status).toBe('planned');
    if (result.status !== 'planned') throw new Error('Expected reconciliation plan');
    expect(requireItem(result.candidate, 'item-a').components.map(({ id }) => id)).toEqual([
      'label',
      'bar',
      'bg',
      'status',
    ]);
    expect(requireComponent(result.candidate, 'item-a', 'status')).toMatchObject({ text: 'Running' });
    expect(requireItem(result.candidate, 'item-a').components.some(({ id }) => id === 'icon')).toBe(false);
    expect(result.applied).toEqual([
      elementTarget('item-a'),
      componentTarget('item-a', 'status'),
    ]);
    labelInput.style.fontSize = 99;
    expect(JSON.stringify(components)).not.toBe(inputBefore);
    expect(requireComponent(result.candidate, 'item-a', 'label')).toMatchObject({
      style: { fontSize: 16 },
    });
  });

  it('rejects duplicate component identities, merge reconciliation, and non-item owners', () => {
    const duplicate = planCoreV2MutationTransaction(makeScene(), {
      strict: true,
      operations: [
        {
          op: 'reconcile-components',
          target: elementTarget('item-a'),
          components: [textComponent('same', 'A'), textComponent('same', 'B')],
        },
      ],
    });
    const mergeMode = planCoreV2MutationTransaction(makeScene(), {
      strict: true,
      operations: [
        {
          op: 'reconcile-components',
          target: elementTarget('item-a'),
          components: [],
          matchMode: 'merge',
        },
      ],
    });
    const nonItem = planCoreV2MutationTransaction(makeScene(), {
      strict: true,
      operations: [
        {
          op: 'reconcile-components',
          target: elementTarget('rect-b'),
          components: [],
        },
      ],
    });

    expect(duplicate).toMatchObject({ status: 'rejected', diagnostic: { code: 'DUPLICATE_ID' } });
    expect(mergeMode).toMatchObject({
      status: 'rejected',
      diagnostic: { code: 'UNSUPPORTED_RUNTIME', category: 'UNSUPPORTED_RUNTIME' },
    });
    expect(nonItem).toMatchObject({
      status: 'rejected',
      diagnostic: { code: 'INVALID_MUTATION' },
    });
  });

  it('removes components and leaf elements sequentially', () => {
    const result = planCoreV2MutationTransaction(makeScene(), {
      strict: true,
      operations: [
        { op: 'remove', target: componentTarget('item-a', 'icon'), cascade: 'reject' },
        { op: 'remove', target: elementTarget('rect-b'), cascade: 'reject' },
      ],
    });

    expect(result.status).toBe('planned');
    if (result.status !== 'planned') throw new Error('Expected remove plan');
    expect(findElement(result.candidate.dataset, 'rect-b')).toBeUndefined();
    expect(requireItem(result.candidate, 'item-a').components.some(({ id }) => id === 'icon')).toBe(false);
    expect(result.applied).toEqual([
      componentTarget('item-a', 'icon'),
      elementTarget('rect-b'),
    ]);
  });

  it('requires subtree cascade for non-empty groups', () => {
    const rejected = planCoreV2MutationTransaction(makeScene(), {
      strict: true,
      operations: [{ op: 'remove', target: elementTarget('nested'), cascade: 'reject' }],
    });
    const accepted = planCoreV2MutationTransaction(makeScene(), {
      strict: true,
      operations: [{ op: 'remove', target: elementTarget('nested'), cascade: 'subtree' }],
    });

    expect(rejected).toMatchObject({
      status: 'rejected',
      diagnostic: { code: 'CONFLICTING_FIELDS' },
    });
    expect(accepted.status).toBe('planned');
    if (accepted.status !== 'planned') throw new Error('Expected subtree remove plan');
    expect(findElement(accepted.candidate.dataset, 'nested')).toBeUndefined();
    expect(findElement(accepted.candidate.dataset, 'nested-rect')).toBeUndefined();
  });

  it('reports final dataset validation once and publishes no partial candidate', () => {
    const current = makeScene();
    const result = planCoreV2MutationTransaction(current, {
      strict: true,
      operations: [
        merge(elementTarget('rect-b'), ['attrs', 'x'], 200),
        merge(elementTarget('rect-b'), ['size', 'width'], -1),
      ],
    });

    expect(result).toMatchObject({
      status: 'rejected',
      candidate: null,
      summary: { appliedCount: 0, missingCount: 0, unchangedCount: 0 },
      diagnostic: {
        code: 'INVALID_VALUE',
        category: 'INVALID_INPUT',
        datasetCode: 'INVALID_VALUE',
      },
    });
    expect(requireElement(current.dataset, 'rect-b').attrs?.x).toBe(160);
  });

  it('separates invalid schema versions, unknown operations, and unsupported contract operations', () => {
    const request = {
      strict: true,
      operations: [merge(elementTarget('rect-b'), ['attrs', 'x'], 200)],
    };
    const schema = planCoreV2MutationTransaction(makeScene(), request, 'future/2');
    const unknown = planCoreV2MutationTransaction(makeScene(), {
      strict: true,
      operations: [{ op: 'teleport', target: elementTarget('rect-b') }],
    });
    const unsupported = planCoreV2MutationTransaction(makeScene(), {
      strict: true,
      operations: [
        {
          op: 'unset',
          target: elementTarget('rect-b'),
          paths: [['attrs', 'x']],
        },
      ],
    });

    expect(schema).toMatchObject({
      status: 'rejected',
      diagnostic: { code: 'INVALID_SCHEMA_VERSION' },
    });
    expect(unknown).toMatchObject({ status: 'rejected', diagnostic: { code: 'INVALID_MUTATION' } });
    expect(unsupported).toMatchObject({
      status: 'rejected',
      diagnostic: { code: 'UNSUPPORTED_RUNTIME', category: 'UNSUPPORTED_RUNTIME' },
    });
  });

  it('adds one detached element at an exact root or group-child index', () => {
    const source = hierarchyScene();
    const sourceBefore = JSON.stringify(source);
    const request = {
      strict: true,
      actionId: 'structure-add',
      operations: [{
        op: 'add',
        parent: elementTarget('group-b'),
        collection: 'children',
        index: 0,
        value: {
          type: 'rect',
          id: 'rect-c',
          size: { width: 12, height: 8 },
          fill: '#123456',
          attrs: { x: 4, y: 6 },
        },
      }],
    };
    const requestBefore = JSON.stringify(request);
    const added = planCoreV2MutationTransaction(source, request);

    expect(added.status).toBe('planned');
    if (added.status !== 'planned') throw new Error('Expected add plan');
    expect(parentId(added.candidate.dataset, 'rect-c')).toBe('group-b');
    expect(requireElement(added.candidate.dataset, 'rect-c')).toMatchObject({
      type: 'rect',
      size: { width: 12, height: 8 },
      attrs: { x: 4, y: 6 },
    });
    expect(added.applied).toEqual([elementTarget('rect-c')]);
    expect(added.selectionIds).toEqual(['rect-c']);
    expect(added.allowedElementOrderIds).toEqual(['rect-c']);
    expect(JSON.stringify(source)).toBe(sourceBefore);
    expect(JSON.stringify(request)).toBe(requestBefore);

    const rootAdded = planCoreV2MutationTransaction(added.candidate, {
      strict: true,
      operations: [{
        op: 'add',
        parent: null,
        collection: 'children',
        index: 0,
        value: {
          type: 'text',
          id: 'text-root',
          text: 'Added',
          style: { fontSize: 12, fill: '#111111' },
        },
      }],
    });
    expect(rootAdded.status).toBe('planned');
    if (rootAdded.status !== 'planned') throw new Error('Expected root add plan');
    expect(parentId(rootAdded.candidate.dataset, 'text-root')).toBeNull();
    expect(rootAdded.candidate.dataset[0]?.id).toBe('text-root');

    const duplicate = planCoreV2MutationTransaction(added.candidate, request);
    expect(duplicate).toMatchObject({
      status: 'rejected',
      candidate: null,
      diagnostic: { code: 'DUPLICATE_ID', category: 'INVALID_INPUT' },
    });

    const invalidIndex = planCoreV2MutationTransaction(source, {
      strict: true,
      operations: [{
        ...request.operations[0],
        index: 1,
      }],
    });
    expect(invalidIndex).toMatchObject({
      status: 'rejected',
      candidate: null,
      diagnostic: { code: 'INVALID_VALUE', category: 'INVALID_INPUT' },
    });
  });

  it('moves, groups, and ungroups one stable subtree while preserving pinned world geometry', () => {
    const source = hierarchyScene();
    const sourceBefore = JSON.stringify(source);
    const moved = planCoreV2MutationTransaction(source, {
      strict: true,
      actionId: 'structure-1',
      operations: [{
        op: 'move',
        target: elementTarget('rect-b'),
        parent: elementTarget('group-b'),
        index: 0,
      }],
    });

    expect(moved.status).toBe('planned');
    if (moved.status !== 'planned') throw new Error('Expected hierarchy move plan');
    expect(parentId(moved.candidate.dataset, 'rect-b')).toBe('group-b');
    expect(requireElement(moved.candidate.dataset, 'rect-b').attrs).toMatchObject({
      x: -80,
      y: 40,
    });
    expect(moved.allowedElementOrderIds).toEqual(['rect-b']);

    const grouped = planCoreV2MutationTransaction(moved.candidate, {
      strict: true,
      actionId: 'structure-2',
      operations: [{
        op: 'group',
        targets: [elementTarget('rect-b')],
        value: { type: 'group', id: 'group-c' },
      }],
    });
    expect(grouped.status).toBe('planned');
    if (grouped.status !== 'planned') throw new Error('Expected group plan');
    expect(parentId(grouped.candidate.dataset, 'group-c')).toBe('group-b');
    expect(parentId(grouped.candidate.dataset, 'rect-b')).toBe('group-c');
    expect(grouped.selectionIds).toEqual(['group-c']);
    expect(requireElement(grouped.candidate.dataset, 'rect-b').attrs).toMatchObject({
      x: -80,
      y: 40,
    });

    const ungrouped = planCoreV2MutationTransaction(grouped.candidate, {
      strict: true,
      actionId: 'structure-3',
      operations: [{ op: 'ungroup', target: elementTarget('group-c') }],
    });
    expect(ungrouped.status).toBe('planned');
    if (ungrouped.status !== 'planned') throw new Error('Expected ungroup plan');
    expect(findElement(ungrouped.candidate.dataset, 'group-c')).toBeUndefined();
    expect(parentId(ungrouped.candidate.dataset, 'rect-b')).toBe('group-b');
    expect(ungrouped.selectionIds).toEqual(['rect-b']);
    expect(requireElement(ungrouped.candidate.dataset, 'rect-b').attrs).toMatchObject({
      x: -80,
      y: 40,
    });
    expect(JSON.stringify(source)).toBe(sourceBefore);
  });

  it('rebases the pinned rotation and uniform-scale profile without changing world affine', () => {
    const source = materializeCoreV2Dataset([
      {
        type: 'group',
        id: 'group-a',
        attrs: { x: 10, y: 20, angle: 30, scaleX: 2, scaleY: 2 },
        children: [{
          type: 'rect',
          id: 'rect-b',
          size: { width: 40, height: 30 },
          fill: '#ff8800',
          attrs: { x: 5, y: 7, angle: 15, scaleX: 1.5, scaleY: 1.5 },
        }],
      },
      {
        type: 'group',
        id: 'group-b',
        attrs: { x: 100, y: 50, angle: -20 },
        children: [],
      },
    ]);
    const before = elementWorldAffine(source.dataset, 'rect-b');
    const moved = planCoreV2MutationTransaction(source, {
      strict: true,
      operations: [{
        op: 'move',
        target: elementTarget('rect-b'),
        parent: elementTarget('group-b'),
        index: 0,
      }],
    });

    expect(moved.status).toBe('planned');
    if (moved.status !== 'planned') throw new Error('Expected affine hierarchy move plan');
    const after = elementWorldAffine(moved.candidate.dataset, 'rect-b');
    after.forEach((value, index) => expect(value).toBeCloseTo(before[index] ?? Number.NaN, 10));
  });

  it('rejects hierarchy cycles, locked ancestry, cross-parent groups, and caller children atomically', () => {
    const moved = planCoreV2MutationTransaction(hierarchyScene(), {
      strict: true,
      recordHistory: false,
      operations: [{
        op: 'move',
        target: elementTarget('group-a'),
        parent: elementTarget('group-b'),
        index: 0,
      }],
    });
    expect(moved.status).toBe('planned');
    if (moved.status !== 'planned') throw new Error('Expected hierarchy setup plan');

    const cycle = planCoreV2MutationTransaction(moved.candidate, {
      strict: true,
      operations: [{
        op: 'move',
        target: elementTarget('group-b'),
        parent: elementTarget('group-a'),
        index: 0,
      }],
    });
    expect(cycle).toMatchObject({
      status: 'rejected',
      candidate: null,
      diagnostic: { code: 'CONFLICT', category: 'CONFLICT' },
    });
    expect(parentId(moved.candidate.dataset, 'group-a')).toBe('group-b');

    const locked = planCoreV2MutationTransaction(lockedHierarchyScene(), {
      strict: true,
      operations: [{
        op: 'move',
        target: elementTarget('rect-b'),
        parent: elementTarget('group-b'),
        index: 0,
      }],
    });
    expect(locked).toMatchObject({
      status: 'rejected',
      diagnostic: { code: 'CONFLICT', category: 'CONFLICT' },
    });

    const crossParent = planCoreV2MutationTransaction(hierarchyScene(), {
      strict: true,
      operations: [{
        op: 'group',
        targets: [elementTarget('rect-b'), elementTarget('other')],
        value: { type: 'group', id: 'group-c' },
      }],
    });
    expect(crossParent).toMatchObject({
      status: 'rejected',
      diagnostic: { code: 'CONFLICT', category: 'CONFLICT' },
    });

    const callerChildren = planCoreV2MutationTransaction(hierarchyScene(), {
      strict: true,
      operations: [{
        op: 'group',
        targets: [elementTarget('rect-b')],
        value: { type: 'group', id: 'group-c', children: [] },
      }],
    });
    expect(callerChildren).toMatchObject({
      status: 'rejected',
      diagnostic: { code: 'CONFLICTING_FIELDS' },
    });
  });
});

function merge(
  target: ReturnType<typeof elementTarget> | ReturnType<typeof componentTarget>,
  path: readonly (string | number)[],
  value: unknown,
): Readonly<Record<string, unknown>> {
  return { op: 'merge', target, changes: [{ path, value }] };
}

function elementTarget(id: string): Readonly<{ kind: 'element'; id: string }> {
  return { kind: 'element', id };
}

function componentTarget(
  ownerId: string,
  id: string,
): Readonly<{ kind: 'component'; ownerId: string; id: string }> {
  return { kind: 'component', ownerId, id };
}

function textComponent(id: string, text: string): {
  type: 'text';
  id: string;
  text: string;
  placement: 'center';
  style: { fontFamily: string; fontSize: number; fill: string };
} {
  return {
    type: 'text',
    id,
    text,
    placement: 'center',
    style: { fontFamily: 'FiraCode', fontSize: 16, fill: '#111111' },
  };
}

function barComponent(id: string, fill: string): Readonly<Record<string, unknown>> {
  return {
    type: 'bar',
    id,
    source: { type: 'rect', fill },
    size: { width: 60, height: 10 },
    placement: 'bottom',
    animation: true,
    animationDuration: 200,
  };
}

function backgroundComponent(id: string, fill: string): Readonly<Record<string, unknown>> {
  return { type: 'background', id, source: { type: 'rect', fill } };
}

function makeScene(): MaterializedCoreV2Dataset {
  return materializeCoreV2Dataset([
    {
      type: 'group',
      id: 'root',
      children: [
        {
          type: 'item',
          id: 'item-a',
          size: { width: 120, height: 80 },
          padding: { top: 3, right: 4, bottom: 5, left: 6 },
          attrs: { position: { x: 20, y: 30 } },
          components: [
            backgroundComponent('bg', '#336699'),
            {
              type: 'bar',
              id: 'bar',
              source: { type: 'rect', fill: '#2563ebff' },
              size: { width: 60, height: 12 },
              attrs: {
                telemetry: { enabled: true, sample: 1 },
                tags: ['initial', 'retained'],
              },
            },
            {
              type: 'icon',
              id: 'icon',
              source: 'icon.png',
              size: 16,
            },
            textComponent('label', 'Alpha'),
            { ...textComponent('hidden-label', 'Hidden'), show: false },
          ],
        },
        {
          type: 'item',
          id: 'item-b',
          size: { width: 100, height: 60 },
          components: [barComponent('bar', '#ef4444ff')],
        },
        {
          type: 'rect',
          id: 'rect-b',
          size: { width: 40, height: 30 },
          fill: '#ff0000',
          attrs: { x: 160, y: 40, tags: ['original'] },
        },
        {
          type: 'group',
          id: 'nested',
          children: [
            {
              type: 'rect',
              id: 'nested-rect',
              size: { width: 10, height: 10 },
            },
          ],
        },
      ],
    },
  ]);
}

function hierarchyScene(): MaterializedCoreV2Dataset {
  return materializeCoreV2Dataset([
    {
      type: 'group',
      id: 'group-a',
      attrs: { x: 0, y: 0 },
      children: [{
        type: 'rect',
        id: 'rect-b',
        size: { width: 40, height: 30 },
        fill: '#ff8800',
        attrs: { x: 160, y: 40 },
      }],
    },
    {
      type: 'group',
      id: 'group-b',
      attrs: { x: 240, y: 0 },
      children: [],
    },
    {
      type: 'rect',
      id: 'other',
      size: { width: 10, height: 10 },
      fill: '#00ff00',
    },
  ]);
}

function lockedHierarchyScene(): MaterializedCoreV2Dataset {
  return materializeCoreV2Dataset([
    {
      type: 'group',
      id: 'group-a',
      locked: true,
      children: [{
        type: 'rect',
        id: 'rect-b',
        size: { width: 40, height: 30 },
        fill: '#ff8800',
        attrs: { x: 160, y: 40 },
      }],
    },
    { type: 'group', id: 'group-b', children: [] },
  ]);
}

function requireItem(materialized: MaterializedCoreV2Dataset, id: string): CoreV2ItemElement {
  const element = requireElement(materialized.dataset, id);
  if (element.type !== 'item') throw new Error(`Expected item ${id}`);
  return element;
}

function requireComponent(
  materialized: MaterializedCoreV2Dataset,
  ownerId: string,
  id: string,
): CoreV2Component {
  const component = requireItem(materialized, ownerId).components.find((entry) => entry.id === id);
  if (component === undefined) throw new Error(`Missing component ${ownerId}/${id}`);
  return component;
}

function requireElement(elements: readonly CoreV2Element[], id: string): CoreV2Element {
  const element = findElement(elements, id);
  if (element === undefined) throw new Error(`Missing element ${id}`);
  return element;
}

function findElement(elements: readonly CoreV2Element[], id: string): CoreV2Element | undefined {
  for (const element of elements) {
    if (element.id === id) return element;
    if (element.type === 'group') {
      const nested = findElement(element.children, id);
      if (nested !== undefined) return nested;
    }
  }
  return undefined;
}

function parentId(elements: readonly CoreV2Element[], id: string): string | null | undefined {
  for (const element of elements) {
    if (element.id === id) return null;
    if (element.type !== 'group') continue;
    if (element.children.some((child) => child.id === id)) return element.id;
    const nested = parentId(element.children, id);
    if (nested !== undefined) return nested;
  }
  return undefined;
}

function elementWorldAffine(
  elements: readonly CoreV2Element[],
  id: string,
  parent: CoreV2AffineMatrix = CORE_V2_IDENTITY_AFFINE,
): CoreV2AffineMatrix {
  for (const element of elements) {
    const attrs = element.attrs ?? {};
    const rotation = finiteAttribute(attrs.rotation, 0);
    const angle = typeof attrs.angle === 'number' && Number.isFinite(attrs.angle)
      ? attrs.angle
      : rotation * 180 / Math.PI;
    const local = createCoreV2Affine(
      finiteAttribute(attrs.x, 0),
      finiteAttribute(attrs.y, 0),
      angle,
      finiteAttribute(attrs.scaleX, 1),
      finiteAttribute(attrs.scaleY, 1),
    );
    const world = multiplyCoreV2Affine(parent, local);
    if (element.id === id) return world;
    if (element.type === 'group') {
      try {
        return elementWorldAffine(element.children, id, world);
      } catch (error) {
        if (!(error instanceof Error) || error.message !== `Missing affine element ${id}`) {
          throw error;
        }
      }
    }
  }
  throw new Error(`Missing affine element ${id}`);
}

function finiteAttribute(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
