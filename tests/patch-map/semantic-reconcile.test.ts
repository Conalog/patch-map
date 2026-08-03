import { describe, expect, it } from 'vitest';

import { CoreScene } from '../../src/patch-map/dense/scene';
import type {
  EntityInput,
  RectEntityInput,
  SceneDocument,
} from '../../src/patch-map/dense/contracts';
import {
  RenderFlags,
  type CoreRenderer,
  type RenderStoreView,
} from '../../src/patch-map/dense/renderer-types';
import { parsePatchMapV010 } from '../../src/patch-map/parser';
import { materializePatchMapDataset } from '../../src/patch-map/semantic/dataset';
import {
  planPatchMapDatasetReconcile,
  planPatchMapParsedSceneReconcile,
  planPatchMapParsedSceneReconcileIncremental,
  planPatchMapParsedSceneReconcileStructuralWindow,
  planPatchMapSceneReconcile,
} from '../../src/patch-map/semantic/reconcile';

describe('PatchMap dense reconcile planner', () => {
  it('returns an immutable empty transaction for an unchanged scene', () => {
    const scene = document(rect('box'));

    const plan = planPatchMapSceneReconcile(scene, scene, { id: 'same' });

    expect(plan.batch).toEqual({ id: 'same', operations: [] });
    expect(plan.safeToCommit).toBe(true);
    expect(plan.summary).toEqual({
      operationCount: 0,
      added: 0,
      patched: 0,
      visibilityChanged: 0,
      removed: 0,
      replaced: 0,
      unchanged: 1,
      viewChanged: false,
      unsupported: 0,
    });
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.batch.operations)).toBe(true);
  });

  it('patches a same-ID entity without changing its dense ref or slot', () => {
    const current = document(rect('box', { x: 4, fill: 0x112233ff }));
    const candidate = document(rect('box', { x: 18, width: 42, fill: 0xaabbccff }));
    const scene = new CoreScene();
    scene.load(current);
    const refBefore = scene.ref('box');

    const plan = planPatchMapSceneReconcile(current, candidate);
    scene.commit(plan.batch);

    expect(plan.batch.operations).toEqual([
      {
        type: 'patch',
        target: 'box',
        changes: { x: 18, width: 42, fill: 0xaabbccff },
      },
    ]);
    expect(scene.ref('box')).toEqual(refBefore);
    expect(scene.get('box')).toMatchObject({
      bounds: { x: 18, width: 42 },
      data: { fill: 0xaabbccff },
    });
    scene.destroy();
  });

  it('plans an identity-stable dirty row exactly and rejects undeclared row changes', () => {
    const current = parsePatchMapV010(materializePatchMapDataset([
      { type: 'rect', id: 'a', size: { width: 20, height: 10 }, attrs: { x: 0 } },
      { type: 'rect', id: 'b', size: { width: 20, height: 10 }, attrs: { x: 30 } },
      { type: 'rect', id: 'c', size: { width: 20, height: 10 }, attrs: { x: 60 } },
    ]).dataset).document;
    const entities = current.entities.map((entity) =>
      entity.id === 'b' ? Object.freeze({ ...entity, x: 42 }) : entity);
    const candidate = Object.freeze({
      ...current,
      entities: Object.freeze(entities),
    });

    const incremental = planPatchMapParsedSceneReconcileIncremental(
      current,
      candidate,
      ['b'],
    );
    const canonical = planPatchMapParsedSceneReconcile(current, candidate);

    expect(incremental).toEqual(canonical);
    expect(planPatchMapParsedSceneReconcileIncremental(current, candidate, ['a']))
      .toBeNull();
    expect(
      planPatchMapParsedSceneReconcileIncremental(
        current,
        candidate,
        ['b'],
        {},
        true,
      ),
    ).toEqual(canonical);
  });

  it('keeps owner-local component identity while changing component geometry and text', () => {
    const current = materializePatchMapDataset([
      itemWithText('Status', 100),
    ]);
    const candidate = materializePatchMapDataset([
      itemWithText('Ready', 160),
    ]);
    const currentDocument = parsePatchMapV010(current.dataset).document;
    const scene = new CoreScene();
    scene.load(currentDocument);
    const entityId = 'item-a::text:caption';
    const refBefore = scene.ref(entityId);

    const plan = planPatchMapDatasetReconcile(current, candidate);
    scene.commit(plan.batch);

    expect(plan.batch.operations).toHaveLength(1);
    const operation = plan.batch.operations[0];
    expect(operation?.type).toBe('patch');
    if (operation?.type !== 'patch') throw new Error('expected a component patch');
    expect(operation.target).toBe(entityId);
    expect(operation.changes).toMatchObject({ text: 'Ready', width: 40 });
    expect(plan.summary).toMatchObject({ added: 0, removed: 0, patched: 1 });
    expect(scene.ref(entityId)).toEqual(refBefore);
    expect(scene.get(entityId)?.data.text).toBe('Ready');
    expect(scene.get(entityId)?.bounds.width).toBe(40);
    scene.destroy();
  });

  it('uses a dedicated visibility operation for a same-ID visibility change', () => {
    const current = document(rect('box', { visible: true }));
    const candidate = document(rect('box', { visible: false }));

    const plan = planPatchMapSceneReconcile(current, candidate);

    expect(plan.batch.operations).toEqual([
      { type: 'visibility', target: 'box', visible: false },
    ]);
    expect(plan.summary).toMatchObject({ patched: 0, visibilityChanged: 1 });
  });

  it('emits deterministic explicit add and remove operations', () => {
    const current = document(rect('keep'), rect('remove'));
    const candidate = document(rect('keep'), rect('add', { x: 25 }));

    const first = planPatchMapSceneReconcile(current, candidate);
    const second = planPatchMapSceneReconcile(current, candidate);

    expect(first.batch.operations[0]).toEqual({ type: 'remove', target: 'remove' });
    const addOperation = first.batch.operations[1];
    expect(addOperation?.type).toBe('add');
    if (addOperation?.type !== 'add') throw new Error('expected an add operation');
    expect(addOperation.entity).toMatchObject({ id: 'add', x: 25 });
    expect(first).toEqual(second);
    expect(first.summary).toMatchObject({ added: 1, removed: 1, replaced: 0 });
  });

  it('represents a same-ID kind replacement as remove then add', () => {
    const current = document(rect('content'));
    const candidate = document({
      kind: 'text',
      id: 'content',
      x: 0,
      y: 0,
      width: 80,
      height: 20,
      text: 'replacement',
      color: 0x223344ff,
      fontSize: 14,
    });
    const scene = new CoreScene();
    scene.load(current);
    const refBefore = scene.ref('content');

    const plan = planPatchMapSceneReconcile(current, candidate);
    scene.commit(plan.batch);

    expect(plan.batch.operations.map((operation) => operation.type)).toEqual(['remove', 'add']);
    expect(plan.summary).toMatchObject({ added: 1, removed: 1, replaced: 1 });
    expect(scene.get('content')?.kind).toBe('text');
    expect(scene.ref('content')).not.toEqual(refBefore);
    scene.destroy();
  });

  it('advances same-ID kind identity and relation adjacency across undo and redo', () => {
    const current = document(rect('a'), rect('b', { x: 30 }), rect('content'));
    const candidate = document(
      rect('a'),
      rect('b', { x: 30 }),
      relation('content', 'a', 'b'),
    );
    const renderer = new SelectedCountRenderer();
    const scene = new CoreScene({ historyLimit: 1, renderer });
    scene.load(current);
    scene.commit({ operations: [{ type: 'selection', targets: ['content'], mode: 'replace' }] });
    scene.commit(planPatchMapSceneReconcile(current, candidate).batch);
    const relationRef = scene.ref('content');
    expect(scene.get('content')?.kind).toBe('relation');
    scene.flush();
    expect(renderer.selectedCount).toBe(1);

    expect(scene.undo()).toBe(true);
    expect(scene.get(relationRef!)).toBeNull();
    expect(scene.get('content')?.kind).toBe('rect');
    scene.flush();
    expect(renderer.selectedCount).toBe(1);
    const rectRef = scene.ref('content');

    expect(scene.redo()).toBe(true);
    expect(scene.get(rectRef!)).toBeNull();
    expect(scene.get('content')).toMatchObject({
      kind: 'relation',
      data: { from: 'a', to: 'b' },
    });
    expect(scene.ref('content')).not.toEqual(relationRef);
    scene.flush();
    expect(renderer.selectedCount).toBe(1);
    scene.destroy();
  });

  it('removes dependent relations before endpoints and updates relations after entity changes', () => {
    const current = document(
      rect('a'),
      rect('b', { x: 30 }),
      relation('link', 'a', 'b'),
    );
    const withoutRelationOrEndpoint = document(rect('a'));

    expect(
      planPatchMapSceneReconcile(current, withoutRelationOrEndpoint).batch.operations,
    ).toEqual([
      { type: 'remove', target: 'link' },
      { type: 'remove', target: 'b' },
    ]);

    const candidate = document(
      rect('a'),
      rect('c', { x: 60 }),
      relation('link', 'a', 'c'),
    );
    const plan = planPatchMapSceneReconcile(current, candidate);
    const scene = new CoreScene();
    scene.load(current);
    scene.commit(plan.batch);

    expect(plan.batch.operations[0]).toEqual({ type: 'remove', target: 'b' });
    const addOperation = plan.batch.operations[1];
    expect(addOperation?.type).toBe('add');
    if (addOperation?.type !== 'add') throw new Error('expected an endpoint add');
    expect(addOperation.entity).toMatchObject({ id: 'c' });
    expect(plan.batch.operations[2]).toEqual({
      type: 'patch',
      target: 'link',
      changes: { to: 'c' },
    });
    expect(scene.get('link')?.data).toMatchObject({ from: 'a', to: 'c' });
    scene.destroy();
  });

  it('emits a view change after entity operations in the same batch', () => {
    const current = document(rect('box'));
    const candidate: SceneDocument = {
      ...document(rect('box', { x: 10 })),
      view: { x: 30, y: 40, scale: 2 },
    };

    const plan = planPatchMapSceneReconcile(current, candidate);

    expect(plan.batch.operations.map((operation) => operation.type)).toEqual(['patch', 'view']);
    expect(plan.summary.viewChanged).toBe(true);
  });

  it('does not mutate or retain mutable aliases into caller documents', () => {
    const currentTags = ['old'];
    const candidateTags = ['new'];
    const current = document(rect('box', { tags: currentTags }));
    const candidate = document(rect('box', { tags: candidateTags }));
    const before = JSON.stringify({ current, candidate });

    const plan = planPatchMapSceneReconcile(current, candidate);
    expect(JSON.stringify({ current, candidate })).toBe(before);
    candidateTags[0] = 'mutated-after-planning';

    expect(plan.batch.operations).toEqual([
      { type: 'patch', target: 'box', changes: { tags: ['new'] } },
    ]);
    expect(Object.isFrozen(
      plan.batch.operations[0]?.type === 'patch'
        ? plan.batch.operations[0].changes.tags
        : undefined,
    )).toBe(true);
    expect(currentTags).toEqual(['old']);
  });

  it('surfaces unsupported background and authored-order deltas instead of hiding them', () => {
    const backgroundPlan = planPatchMapSceneReconcile(
      { ...document(rect('a')), background: 0xffffffff },
      { ...document(rect('a')), background: 0x000000ff },
    );
    const orderPlan = planPatchMapSceneReconcile(
      document(rect('a'), rect('b')),
      document(rect('b'), rect('a')),
    );

    expect(backgroundPlan.safeToCommit).toBe(false);
    expect(backgroundPlan.diagnostics).toContainEqual(expect.objectContaining({
      code: 'BACKGROUND_CHANGE_UNSUPPORTED',
      severity: 'error',
    }));
    expect(orderPlan.safeToCommit).toBe(false);
    expect(orderPlan.diagnostics).toContainEqual(expect.objectContaining({
      code: 'ENTITY_ORDER_CHANGE_UNSUPPORTED',
      severity: 'error',
    }));

    const zOrderedPlan = planPatchMapSceneReconcile(
      document(rect('back', { zIndex: 0 }), rect('front', { zIndex: 1 })),
      document(rect('front', { zIndex: 1 }), rect('back', { zIndex: 0 })),
    );
    expect(zOrderedPlan.safeToCommit).toBe(true);
  });

  it('allows an exact declared set of stable component dense IDs to reorder without row churn', () => {
    const current = materializePatchMapDataset([
      itemWithOrderedTextComponents(['first', 'second', 'third']),
    ]);
    const candidate = materializePatchMapDataset([
      itemWithOrderedTextComponents(['third', 'second', 'first']),
    ]);
    const allowedRetainedOrderIds = Object.freeze([
      'item-a::text:first',
      'item-a::text:second',
      'item-a::text:third',
    ]);

    const plan = planPatchMapDatasetReconcile(
      current,
      candidate,
      {},
      { allowedRetainedOrderIds },
    );

    expect(plan.safeToCommit).toBe(true);
    expect(plan.batch.operations).toEqual([]);
    expect(plan.summary).toMatchObject({
      added: 0,
      removed: 0,
      replaced: 0,
      operationCount: 0,
      unsupported: 0,
    });
    expect(plan.diagnostics).not.toContainEqual(expect.objectContaining({
      code: 'ENTITY_ORDER_CHANGE_UNSUPPORTED',
    }));
    expect(allowedRetainedOrderIds).toEqual([
      'item-a::text:first',
      'item-a::text:second',
      'item-a::text:third',
    ]);
  });

  it('plans a large parser-owned reference reorder in one empty dense batch', () => {
    const entities = Object.freeze(
      Array.from({ length: 2_000 }, (_, index) =>
        rect(`node-${index}`)) as readonly EntityInput[],
    );
    const reordered = Object.freeze([
      ...entities.slice(1),
      entities[0]!,
    ]);
    const plan = planPatchMapParsedSceneReconcileStructuralWindow(
      document(...entities),
      document(...reordered),
      { allowedRetainedOrderIds: entities.map(({ id }) => id) },
    );

    expect(plan).not.toBeNull();
    expect(plan).toMatchObject({
      safeToCommit: true,
      batch: { operations: [] },
      summary: {
        operationCount: 0,
        unchanged: 2_000,
        unsupported: 0,
      },
    });
  });

  it('does not fast-accept a reference reorder with a partial authority set', () => {
    const first = rect('first');
    const second = rect('second');
    const plan = planPatchMapParsedSceneReconcileStructuralWindow(
      document(first, second),
      document(second, first),
      { allowedRetainedOrderIds: ['first'] },
    );

    expect(plan?.safeToCommit).toBe(false);
    expect(plan?.diagnostics).toContainEqual(expect.objectContaining({
      code: 'ENTITY_ORDER_CHANGE_UNSUPPORTED',
    }));
  });

  it('refuses a component reorder when the declared retained-order set is partial', () => {
    const current = materializePatchMapDataset([
      itemWithOrderedTextComponents(['first', 'second', 'third']),
    ]);
    const candidate = materializePatchMapDataset([
      itemWithOrderedTextComponents(['third', 'second', 'first']),
    ]);

    const plan = planPatchMapDatasetReconcile(
      current,
      candidate,
      {},
      {
        allowedRetainedOrderIds: [
          'item-a::text:first',
          'item-a::text:third',
        ],
      },
    );

    expect(plan.safeToCommit).toBe(false);
    expect(plan.batch.operations).toEqual([]);
    expect(plan.diagnostics).toContainEqual(expect.objectContaining({
      code: 'ENTITY_ORDER_CHANGE_UNSUPPORTED',
      severity: 'error',
    }));
  });

  it('still refuses a relative-order change involving a disallowed element ID', () => {
    const plan = planPatchMapSceneReconcile(
      document(rect('allowed'), rect('outside')),
      document(rect('outside'), rect('allowed')),
      { allowedRetainedOrderIds: ['allowed'] },
    );

    expect(plan.safeToCommit).toBe(false);
    expect(plan.diagnostics).toContainEqual(expect.objectContaining({
      code: 'ENTITY_ORDER_CHANGE_UNSUPPORTED',
      severity: 'error',
    }));
  });

  it('reports a normalized semantic-only delta that has no dense projection', () => {
    const current = materializePatchMapDataset([
      { type: 'rect', id: 'box', label: 'Before', size: 10 },
    ]);
    const candidate = materializePatchMapDataset([
      { type: 'rect', id: 'box', label: 'After', size: 10 },
    ]);

    const plan = planPatchMapDatasetReconcile(current, candidate);

    expect(plan.batch.operations).toEqual([]);
    expect(plan.safeToCommit).toBe(true);
    expect(plan.diagnostics).toContainEqual(expect.objectContaining({
      code: 'UNPROJECTED_SEMANTIC_DELTA',
      severity: 'warning',
    }));
  });
});

class SelectedCountRenderer implements CoreRenderer {
  public readonly width = 800;
  public readonly height = 600;
  public readonly pixelRatio = 1;
  public destroyed = false;
  public selectedCount = 0;

  public resize(): boolean { return false; }
  public setView(): boolean { return false; }
  public flush(store: RenderStoreView): Readonly<{
    readonly rendered: boolean;
    readonly commandCount: number;
  }> {
    this.selectedCount = 0;
    for (let slot = 0; slot < store.capacity; slot += 1) {
      if (
        (store.alive[slot] ?? 0) !== 0 &&
        ((store.flags[slot] ?? 0) & RenderFlags.Selected) !== 0
      ) {
        this.selectedCount += 1;
      }
    }
    return Object.freeze({ rendered: true, commandCount: 1 });
  }
  public destroy(): boolean {
    if (this.destroyed) return false;
    this.destroyed = true;
    return true;
  }
}

function document(...entities: readonly EntityInput[]): SceneDocument {
  return { version: 1, entities };
}

function rect(
  id: string,
  overrides: Partial<Omit<RectEntityInput, 'kind' | 'id'>> = {},
): RectEntityInput {
  return {
    kind: 'rect',
    id,
    x: 0,
    y: 0,
    width: 20,
    height: 10,
    fill: 0xffffffff,
    ...overrides,
  };
}

function relation(id: string, from: string, to: string): EntityInput {
  return {
    kind: 'relation',
    id,
    from,
    to,
    color: 0x334455ff,
  };
}

function itemWithText(text: string, width: number): Readonly<Record<string, unknown>> {
  return {
    type: 'item',
    id: 'item-a',
    size: { width: 200, height: 80 },
    components: [
      {
        type: 'text',
        id: 'caption',
        text,
        placement: 'left',
        style: { fontSize: 16, wordWrapWidth: width },
      },
    ],
  };
}

function itemWithOrderedTextComponents(
  componentIds: readonly string[],
): Readonly<Record<string, unknown>> {
  return {
    type: 'item',
    id: 'item-a',
    size: { width: 200, height: 80 },
    components: componentIds.map((id) => ({
      type: 'text',
      id,
      text: id,
      placement: 'center',
      style: { fontSize: 16 },
    })),
  };
}
