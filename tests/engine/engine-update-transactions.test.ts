import { afterEach, describe, expect, it } from 'vitest';

import type {
  PatchMapElement,
  PatchMapGridElement,
  PatchMapItemElement,
  PatchMapRectElement,
} from '../../src/semantic/dataset';
import type { PatchMapMutationJsonValue } from '../../src/semantic/transaction';
import type {
  PatchMap,
  PatchMapEngineSurface,
  PatchMapSurfacePointerInput,
} from '../../src/engine';
import { createEngine } from '../support/engine-update-transaction-surface';

describe('PatchMap update transactions', () => {
  const engines: PatchMap[] = [];

  afterEach(async () => {
    await Promise.all(engines.splice(0).map((engine) => engine.destroy()));
  });

  it('publishes one reconcile, revision, change event, and history unit for one transaction', async () => {
    const { engine, surface } = await createEngine(engines, 'atomic-publication');
    engine.loadDataset(updateScene());
    const changes: unknown[] = [];
    engine.on('change', (event) => changes.push(event));

    const result = engine.transact({
      strict: true,
      actionId: 'atomic-1',
      operations: [
        mergeElement('rect-b', [['attrs', 'x']], [180]),
        {
          op: 'merge',
          target: { kind: 'component', ownerId: 'item-a', id: 'label' },
          changes: [{ path: ['text'], value: 'Updated' }],
        },
      ],
    });

    expect(result).toMatchObject({
      status: 'committed',
      changed: true,
      actionId: 'atomic-1',
      previousRevisions: { sceneRevision: 1 },
      revisions: { sceneRevision: 2 },
      applied: [
        { kind: 'element', id: 'rect-b' },
        { kind: 'component', ownerId: 'item-a', id: 'label' },
      ],
      missing: [],
      unchanged: [],
      history: {
        recorded: true,
        commandId: 'atomic-1',
        depthDelta: 1,
        state: { undoDepth: 1, redoDepth: 0 },
      },
      publication: 'pending',
    });
    expect(surface.reconcileCalls).toHaveLength(1);
    expect(surface.loadCount).toBe(1);
    expect(surface.reconcileCalls[0]?.input).toBe(engine.exportDataset());
    expect(changes).toEqual([result]);
    expect(rectById(engine, 'rect-b').attrs?.x).toBe(180);
    expect(componentById(engine, 'item-a', 'label')).toMatchObject({ text: 'Updated' });
    expect(engine.snapshot()).toMatchObject({
      revisions: { sceneRevision: 2 },
      historyDepth: 1,
    });
  });

  it('commits permissive missing targets and rolls back a strict late miss', async () => {
    const { engine, surface } = await createEngine(engines, 'missing-policy');
    engine.loadDataset(updateScene());

    const permissive = engine.transact({
      strict: false,
      actionId: 'permissive',
      operations: [
        mergeElement('missing', [['attrs', 'x']], [1]),
        mergeElement('rect-b', [['attrs', 'x']], [180]),
      ],
    });
    expect(permissive).toMatchObject({
      status: 'committed',
      applied: [{ kind: 'element', id: 'rect-b' }],
      missing: [{ kind: 'element', id: 'missing' }],
      history: { depthDelta: 1 },
    });
    expect(rectById(engine, 'rect-b').attrs?.x).toBe(180);
    expect(surface.reconcileCalls).toHaveLength(1);

    const authorityBefore = engine.exportDataset();
    const snapshotBefore = engine.snapshot();
    const historyBefore = engine.historyState();
    const strict = engine.transact({
      strict: true,
      actionId: 'strict-late',
      operations: [
        mergeElement('rect-b', [['attrs', 'y']], [999]),
        mergeElement('missing', [['attrs', 'x']], [2]),
      ],
    });

    expect(strict).toMatchObject({
      status: 'rejected',
      changed: false,
      actionId: 'strict-late',
      revisions: { sceneRevision: 2 },
      transactionDiagnostic: {
        code: 'MISSING_TARGET',
        category: 'MISSING_TARGET',
        operationIndex: 1,
        target: { kind: 'element', id: 'missing' },
      },
      history: { recorded: false, depthDelta: 0 },
    });
    expect(surface.reconcileCalls).toHaveLength(1);
    expect(engine.exportDataset()).toBe(authorityBefore);
    expect(engine.snapshot()).toEqual(snapshotBefore);
    expect(engine.historyState()).toEqual(historyBefore);
    expect(rectById(engine, 'rect-b').attrs?.y).toBe(40);
  });

  it('routes an empty bulk target set through a validated zero-publication product no-op', async () => {
    const { engine, surface } = await createEngine(engines, 'empty-bulk-targets');
    engine.loadDataset(updateScene());
    const changes: unknown[] = [];
    const diagnostics: unknown[] = [];
    engine.on('change', (event) => changes.push(event));
    engine.on('diagnostic', (event) => diagnostics.push(event));
    const authorityBefore = engine.exportDataset();
    const snapshotBefore = engine.snapshot();
    const historyBefore = engine.historyState();
    const request = Object.freeze({
      strict: true,
      actionId: 'empty-target-set',
      targets: Object.freeze([]),
      changes: Object.freeze([
        Object.freeze({ path: Object.freeze(['attrs', 'x']), value: 200 }),
      ]),
    });
    const requestBefore = JSON.stringify(request);

    const result = engine.bulkPatch(request);

    expect(result).toMatchObject({
      status: 'unchanged',
      changed: false,
      actionId: 'empty-target-set',
      applied: [],
      missing: [],
      unchanged: [],
      history: { recorded: false, depthDelta: 0 },
    });
    expect(engine.exportDataset()).toBe(authorityBefore);
    expect(engine.snapshot()).toEqual(snapshotBefore);
    expect(engine.historyState()).toEqual(historyBefore);
    expect(surface.reconcileCalls).toHaveLength(0);
    expect(changes).toEqual([]);
    expect(diagnostics).toEqual([]);
    expect(JSON.stringify(request)).toBe(requestBefore);

    const invalid = engine.bulkPatch({
      strict: true,
      targets: [],
      changes: [{ path: ['constructor'], value: 1 }],
    });
    expect(invalid).toMatchObject({
      status: 'rejected',
      diagnostic: { operation: 'bulkPatch' },
      transactionDiagnostic: { code: 'INVALID_PATH' },
    });
    expect(surface.reconcileCalls).toHaveLength(0);
  });

  it('plans a non-empty bulk patch once before the shared atomic commit path', async () => {
    const { engine, surface } = await createEngine(engines, 'single-plan-bulk');
    engine.loadDataset(updateScene());
    const planningCalls: string[] = [];
    const planningSeam = engine as unknown as {
      planMutationRequest(request: unknown, schemaRevision: string): unknown;
      planBulkPatchRequest(request: unknown, schemaRevision: string): unknown;
    };
    const planMutationRequest = planningSeam.planMutationRequest.bind(engine);
    const planBulkPatchRequest = planningSeam.planBulkPatchRequest.bind(engine);
    planningSeam.planMutationRequest = (request, schemaRevision) => {
      planningCalls.push('transact');
      return planMutationRequest(request, schemaRevision);
    };
    planningSeam.planBulkPatchRequest = (request, schemaRevision) => {
      planningCalls.push('bulkPatch');
      return planBulkPatchRequest(request, schemaRevision);
    };
    const changes: unknown[] = [];
    engine.on('change', (event) => changes.push(event));
    const request = Object.freeze({
      strict: false,
      actionId: 'bulk-single-plan',
      targets: Object.freeze([
        Object.freeze({ kind: 'element' as const, id: 'rect-b' }),
        Object.freeze({ kind: 'element' as const, id: 'missing' }),
      ]),
      changes: Object.freeze([
        Object.freeze({ path: Object.freeze(['attrs', 'x']), value: 220 }),
      ]),
    });
    const requestBefore = JSON.stringify(request);

    const result = engine.bulkPatch(request);

    expect(planningCalls).toEqual(['bulkPatch']);
    expect(result).toMatchObject({
      status: 'committed',
      changed: true,
      actionId: 'bulk-single-plan',
      previousRevisions: { sceneRevision: 1 },
      revisions: { sceneRevision: 2 },
      applied: [{ kind: 'element', id: 'rect-b' }],
      missing: [{ kind: 'element', id: 'missing' }],
      unchanged: [],
      history: {
        recorded: true,
        commandId: 'bulk-single-plan',
        depthDelta: 1,
        state: { undoDepth: 1, redoDepth: 0 },
      },
      publication: 'pending',
    });
    expect(rectById(engine, 'rect-b').attrs?.x).toBe(220);
    expect(surface.reconcileCalls).toHaveLength(1);
    expect(changes).toEqual([result]);
    expect(JSON.stringify(request)).toBe(requestBefore);

    planningCalls.length = 0;
    surface.mode = 'refused';
    const authorityBeforeRefusal = engine.exportDataset();
    const historyBeforeRefusal = engine.historyState();
    expect(engine.bulkPatch({
      strict: true,
      actionId: 'bulk-refused',
      targets: [{ kind: 'element', id: 'rect-b' }],
      changes: [{ path: ['attrs', 'x'], value: 230 }],
    })).toMatchObject({
      status: 'refused',
      changed: false,
      diagnostic: { code: 'CONFLICT', operation: 'bulkPatch' },
      history: { recorded: false, depthDelta: 0 },
    });
    expect(planningCalls).toEqual(['bulkPatch']);
    expect(engine.exportDataset()).toBe(authorityBeforeRefusal);
    expect(engine.historyState()).toEqual(historyBeforeRefusal);
    expect(changes).toEqual([result]);
    expect(surface.reconcileCalls).toHaveLength(2);

    planningCalls.length = 0;
    surface.mode = 'committed';
    expect(engine.transact({
      strict: true,
      operations: [mergeElement('rect-b', [['attrs', 'x']], [220])],
    })).toMatchObject({ status: 'unchanged', changed: false });
    expect(planningCalls).toEqual(['transact']);
    expect(surface.reconcileCalls).toHaveLength(2);
  });

  it('keeps spatial hits lazy and current across geometry and label patches', async () => {
    const { engine, surface } = await createEngine(engines, 'bulk-selection-index');
    engine.loadDataset(updateScene());
    engine.queryScene();
    const seam = engine as unknown as {
      logicalSceneIndex(): unknown;
    };
    const logicalSceneIndex = seam.logicalSceneIndex.bind(engine);
    let logicalSceneIndexCalls = 0;
    seam.logicalSceneIndex = () => {
      logicalSceneIndexCalls += 1;
      return logicalSceneIndex();
    };
    surface.hitId = 'rect-b';

    expect(engine.bulkPatch({
      strict: true,
      targets: [{ kind: 'element', id: 'rect-b' }],
      changes: [{ path: ['attrs', 'angle'], value: 7 }],
    })).toMatchObject({ status: 'committed' });
    expect(engine.selectionHitTestScreen({ x: 10, y: 10 })).toMatchObject({
      target: { id: 'rect-b', value: { attrs: { angle: 7 } } },
    });
    expect(logicalSceneIndexCalls).toBe(0);

    expect(engine.queryScene({ where: { id: 'rect-b' } })).toMatchObject({
      targets: [{ value: { attrs: { angle: 7 } } }],
    });
    expect(logicalSceneIndexCalls).toBe(1);

    logicalSceneIndexCalls = 0;
    expect(engine.bulkPatch({
      strict: true,
      targets: [{ kind: 'element', id: 'rect-b' }],
      changes: [{ path: ['label'], value: 'Changed label' }],
    })).toMatchObject({ status: 'committed' });
    expect(engine.selectionHitTestScreen({ x: 10, y: 10 })).toMatchObject({
      target: { id: 'rect-b', label: 'Changed label' },
    });
    expect(logicalSceneIndexCalls).toBe(0);
    expect(engine.queryScene({ where: { id: 'rect-b' } })).toMatchObject({
      targets: [{ label: 'Changed label' }],
    });
    expect(logicalSceneIndexCalls).toBe(1);
  });

  it('keeps empty merges and cross-scope replacements at zero publication', async () => {
    const { engine, surface } = await createEngine(engines, 'no-op-invalid-kind');
    engine.loadDataset(updateScene());
    const authorityBefore = engine.exportDataset();
    const changes: unknown[] = [];
    engine.on('change', (event) => changes.push(event));
    const before = engine.snapshot();

    const noOp = engine.transact({
      strict: true,
      actionId: 'empty-merge',
      operations: [{
        op: 'merge',
        target: { kind: 'element', id: 'rect-b' },
        changes: [],
      }],
    });
    expect(noOp).toMatchObject({
      status: 'unchanged',
      changed: false,
      actionId: 'empty-merge',
      unchanged: [{ kind: 'element', id: 'rect-b' }],
      history: { recorded: false, depthDelta: 0 },
    });

    const invalidKind = engine.transact({
      strict: true,
      actionId: 'cross-scope',
      operations: [{
        op: 'replace',
        target: { kind: 'element', id: 'rect-b' },
        value: {
          type: 'bar',
          source: { type: 'rect', fill: '#ff0000' },
          size: { width: 20, height: 4 },
        },
      }],
    });
    expect(invalidKind).toMatchObject({
      status: 'rejected',
      changed: false,
      transactionDiagnostic: {
        code: 'INVALID_RECORD_KIND',
        category: 'INVALID_INPUT',
        operationIndex: 0,
      },
      history: { recorded: false, depthDelta: 0 },
    });
    expect(surface.reconcileCalls).toEqual([]);
    expect(surface.frameCount).toBe(0);
    expect(engine.exportDataset()).toBe(authorityBefore);
    expect(engine.snapshot()).toEqual(before);
    expect(changes).toEqual([]);
  });

  it('invalidates resolved targets on generation changes and ordinary scene revisions', async () => {
    const { engine } = await createEngine(engines, 'resolved-targets');
    engine.loadDataset([rectRecord('rect-b', 160, 40)]);
    const generationOne = engine.resolveTarget({ kind: 'element', id: 'rect-b' });
    expect(generationOne).toMatchObject({
      lifecycleGeneration: 1,
      sceneRevision: 1,
      value: { id: 'rect-b', attrs: { x: 160 } },
    });
    if (generationOne === null) throw new Error('expected generation-one target');

    engine.loadDataset([rectRecord('rect-b', 200, 100)]);
    const generationTwo = engine.resolveTarget({ kind: 'element', id: 'rect-b' });
    expect(generationTwo).toMatchObject({
      lifecycleGeneration: 2,
      sceneRevision: 2,
      value: { id: 'rect-b', attrs: { x: 200, y: 100 } },
    });
    if (generationTwo === null) throw new Error('expected generation-two target');
    expect(engine.patchResolved(generationOne, { attrs: { x: 999 } })).toMatchObject({
      status: 'rejected',
      changed: false,
      diagnostic: { code: 'STALE_TARGET', category: 'STALE_TARGET' },
    });
    expect(rectById(engine, 'rect-b').attrs?.x).toBe(200);

    expect(engine.patch({ kind: 'element', id: 'rect-b' }, { attrs: { y: 125 } }))
      .toMatchObject({ status: 'committed', revisions: { sceneRevision: 3 } });
    expect(engine.patchResolved(generationTwo, { attrs: { x: 999 } })).toMatchObject({
      status: 'rejected',
      changed: false,
      diagnostic: { code: 'STALE_TARGET', category: 'STALE_TARGET' },
    });
    const current = engine.resolveTarget({ kind: 'element', id: 'rect-b' });
    expect(current).toMatchObject({ lifecycleGeneration: 2, sceneRevision: 3 });
    if (current === null) throw new Error('expected current target');
    expect(engine.patchResolved(current, { attrs: { x: 225 } }))
      .toMatchObject({ status: 'committed', revisions: { sceneRevision: 4 } });
    expect(rectById(engine, 'rect-b').attrs).toMatchObject({ x: 225, y: 125 });
  });

  it('composes canonical geometry and preserves visible center through resize', async () => {
    const { engine, surface } = await createEngine(engines, 'geometry-origin');
    engine.loadDataset([rectRecord('rect-b', 160, 40)]);
    const changes: unknown[] = [];
    engine.on('change', (event) => changes.push(event));

    expect(engine.patch(
      { kind: 'element', id: 'rect-b' },
      { attrs: { x: 200, y: 100 } },
    )).toMatchObject({ status: 'committed', revisions: { sceneRevision: 2 } });
    expect(position(rectById(engine, 'rect-b'))).toEqual([200, 100]);

    expect(engine.relativePatch(
      { kind: 'element', id: 'rect-b' },
      { attrs: { x: 10, y: -5 }, angle: 45 },
    )).toMatchObject({ status: 'committed', revisions: { sceneRevision: 3 } });
    const relative = rectById(engine, 'rect-b');
    expect(position(relative)).toEqual([210, 95]);
    expect(relative.attrs?.angle).toBe(45);
    const centerBefore = authoredVisibleCenter(relative);

    expect(engine.resizeAroundOrigin(
      { kind: 'element', id: 'rect-b' },
      { origin: 'visible-center', size: { width: 80, height: 50 } },
    )).toMatchObject({ status: 'committed', revisions: { sceneRevision: 4 } });
    const resized = rectById(engine, 'rect-b');
    expect(resized.size).toEqual({ width: 80, height: 50 });
    expect(resized.attrs?.x).toBeCloseTo(202.9289321881, 9);
    expect(resized.attrs?.y).toBeCloseTo(73.7867965644, 9);
    const centerAfter = authoredVisibleCenter(resized);
    expect(centerAfter[0]).toBeCloseTo(centerBefore[0], 12);
    expect(centerAfter[1]).toBeCloseTo(centerBefore[1], 12);
    expect(surface.reconcileCalls).toHaveLength(3);
    expect(changes).toHaveLength(3);
    expect(engine.historyState()).toMatchObject({ undoDepth: 3, redoDepth: 0 });
  });

  it('reconciles component order under one owner-scoped surface permission', async () => {
    const { engine, surface } = await createEngine(engines, 'component-reconcile');
    engine.loadDataset(updateScene());
    const oldBar = engine.resolveTarget({ kind: 'component', ownerId: 'item-a', id: 'bar' });
    expect(oldBar).not.toBeNull();

    const result = engine.transact({
      strict: true,
      actionId: 'components-1',
      operations: [{
        op: 'reconcile-components',
        target: { kind: 'element', id: 'item-a' },
        matchMode: 'replace',
        components: reorderedComponents(),
      }],
    });

    expect(result).toMatchObject({
      status: 'committed',
      applied: [{ kind: 'element', id: 'item-a' }],
      history: { recorded: true, depthDelta: 1 },
    });
    expect(itemById(engine, 'item-a').components.map((component) => component.id)).toEqual([
      'label',
      'bar',
      'bg',
      'status',
    ]);
    const currentBar = engine.resolveTarget({ kind: 'component', ownerId: 'item-a', id: 'bar' });
    expect(currentBar).toMatchObject({
      target: { kind: 'component', ownerId: 'item-a', id: 'bar' },
      value: { type: 'bar', id: 'bar' },
    });
    expect(surface.reconcileCalls).toHaveLength(1);
    expect(surface.reconcileCalls[0]?.options).toEqual({
      animateBarChanges: false,
      animatedBarTargets: [],
      allowedComponentOrderOwners: ['item-a'],
    });
    if (oldBar === null) throw new Error('expected old bar target');
    expect(engine.patchResolved(oldBar, { show: false })).toMatchObject({
      status: 'rejected',
      diagnostic: { code: 'STALE_TARGET' },
    });

    expect(engine.undo()).toMatchObject({
      status: 'committed',
      direction: 'undo',
      history: { undoDepth: 0, redoDepth: 1 },
    });
    expect(itemById(engine, 'item-a').components.map((component) => component.id)).toEqual([
      'bg',
      'bar',
      'label',
    ]);
    expect(surface.reconcileCalls[1]?.options.allowedComponentOrderOwners).toEqual(['item-a']);

    expect(engine.redo()).toMatchObject({
      status: 'committed',
      direction: 'redo',
      history: { undoDepth: 1, redoDepth: 0 },
    });
    expect(itemById(engine, 'item-a').components.map((component) => component.id)).toEqual([
      'label',
      'bar',
      'bg',
      'status',
    ]);
    expect(surface.reconcileCalls[2]?.options.allowedComponentOrderOwners).toEqual(['item-a']);
  });

  it('reconciles relation endpoint move, hide, show, and removal without scene reload', async () => {
    const { engine, surface } = await createEngine(engines, 'relation-refresh');
    engine.loadDataset(relationScene());
    const changes: unknown[] = [];
    engine.on('change', (event) => changes.push(event));

    expect(engine.transact({
      strict: true,
      operations: [mergeElement('b', [['attrs', 'x'], ['attrs', 'y']], [140, 60])],
    })).toMatchObject({ status: 'committed', revisions: { sceneRevision: 2 } });
    expect(position(rectById(engine, 'b'))).toEqual([140, 60]);

    expect(engine.transact({
      strict: true,
      operations: [mergeElement('b', [['show']], [false])],
    })).toMatchObject({ status: 'committed', revisions: { sceneRevision: 3 } });
    expect(rectById(engine, 'b').show).toBe(false);

    expect(engine.transact({
      strict: true,
      operations: [mergeElement('b', [['show']], [true])],
    })).toMatchObject({ status: 'committed', revisions: { sceneRevision: 4 } });
    expect(rectById(engine, 'b').show).toBe(true);

    expect(engine.transact({
      strict: true,
      operations: [{
        op: 'remove',
        target: { kind: 'element', id: 'b' },
        cascade: 'subtree',
      }],
    })).toMatchObject({ status: 'committed', revisions: { sceneRevision: 5 } });
    expect(engine.resolveTarget({ kind: 'element', id: 'b' })).toBeNull();
    expect(relationById(engine, 'links').links).toEqual([
      { source: 'a', target: 'a' },
      { source: 'a', target: 'b' },
      { source: 'b', target: 'a' },
    ]);
    expect(surface).toMatchObject({ loadCount: 1 });
    expect(surface.reconcileCalls).toHaveLength(4);
    expect(changes).toHaveLength(4);
    expect(engine.snapshot()).toMatchObject({
      revisions: { sceneRevision: 5 },
      historyDepth: 4,
    });
  });

  it('preserves authority and prepared history on surface refusal and throw', async () => {
    const { engine, surface } = await createEngine(engines, 'surface-failure');
    engine.loadDataset(updateScene());
    const changes: unknown[] = [];
    engine.on('change', (event) => changes.push(event));
    expect(engine.transact({
      strict: true,
      actionId: 'seed-history',
      operations: [mergeElement('rect-b', [['attrs', 'x']], [180])],
    })).toMatchObject({ status: 'committed', history: { recorded: true } });
    const authorityBefore = engine.exportDataset();
    const snapshotBefore = engine.snapshot();
    const historyBefore = engine.historyState();

    surface.mode = 'refused';
    const refused = engine.transact({
      strict: true,
      actionId: 'refused',
      operations: [mergeElement('rect-b', [['attrs', 'x']], [190])],
    });
    expect(refused).toMatchObject({
      status: 'refused',
      changed: false,
      diagnostic: { code: 'CONFLICT', category: 'CONFLICT' },
      reconcileDiagnostics: [{ code: 'UNPROJECTED_SEMANTIC_DELTA', path: '$.surface' }],
      history: { recorded: false, depthDelta: 0, state: { undoDepth: 1 } },
    });
    expect(engine.exportDataset()).toBe(authorityBefore);
    expect(engine.snapshot()).toEqual(snapshotBefore);
    expect(engine.historyState()).toEqual(historyBefore);

    surface.mode = 'throw';
    const thrown = engine.transact({
      strict: true,
      actionId: 'throw',
      operations: [mergeElement('rect-b', [['attrs', 'x']], [200])],
    });
    expect(thrown).toMatchObject({
      status: 'refused',
      changed: false,
      diagnostic: { code: 'INTERNAL_FAILURE', category: 'INTERNAL_FAILURE' },
      history: { recorded: false, depthDelta: 0, state: { undoDepth: 1 } },
    });
    expect(engine.exportDataset()).toBe(authorityBefore);
    expect(engine.snapshot()).toEqual(snapshotBefore);
    expect(engine.historyState()).toEqual(historyBefore);
    expect(surface.loaded).toBe(authorityBefore);
    expect(changes).toHaveLength(1);
  });

  it('propagates a terminal surface mutation instead of reporting a recoverable refusal', async () => {
    const { engine, surface } = await createEngine(engines, 'surface-terminal');
    engine.loadDataset(updateScene());
    const authorityBefore = engine.exportDataset();
    const viewportBefore = engine.viewportProbe();
    const selectionBefore = engine.selectionIds;
    const internals = engine as unknown as {
      readonly materialized: Readonly<{ dataset: readonly unknown[] }> | null;
      acceptSurfacePointerInput(
        owner: PatchMapEngineSurface,
        input: PatchMapSurfacePointerInput,
      ): void;
    };
    surface.mode = 'terminal';

    expect(() => engine.transact({
      strict: true,
      actionId: 'terminal',
      operations: [mergeElement('rect-b', [['attrs', 'x']], [200])],
    })).toThrow('terminal surface mutation failure');
    expect(() => engine.exportDataset()).toThrow('terminal surface mutation failure');
    expect(internals.materialized?.dataset).toBe(authorityBefore);
    expect(() => engine.historyState()).toThrow('terminal surface mutation failure');
    expect(() => engine.publishFrame()).toThrow('terminal surface mutation failure');
    expect(() => engine.panViewport([10, 5]))
      .toThrow('terminal surface mutation failure');

    surface.emitViewportInput({
      source: 'pointer',
      centerWorld: [999, 999],
      scale: 2,
    });
    surface.hitId = 'rect-b';
    internals.acceptSurfacePointerInput(surface, {
      type: 'down',
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      buttons: 1,
      screen: [180, 40],
      timeMs: 1,
      modifiers: { shift: false, ctrl: false, alt: false, meta: false },
    });
    expect(engine.viewportProbe()).toEqual(viewportBefore);
    expect(engine.selectionIds).toEqual(selectionBefore);
  });

  it('animates direct bar size targets and snaps non-direct ancestor layout changes', async () => {
    const { engine, surface } = await createEngine(engines, 'bar-targeting');
    engine.loadDataset(updateScene());

    expect(engine.transact({
      strict: true,
      operations: [{
        op: 'merge',
        target: { kind: 'component', ownerId: 'item-a', id: 'bar' },
        changes: [{ path: ['size', 'height'], value: 30 }],
      }],
    })).toMatchObject({ status: 'committed' });
    expect(surface.reconcileCalls[0]?.options).toEqual({
      animateBarChanges: true,
      animatedBarTargets: [{ ownerId: 'item-a', componentId: 'bar' }],
      allowedComponentOrderOwners: [],
      incrementalRootIds: ['item-a'],
      directBarHeightUpdates: [
        { ownerId: 'item-a', componentId: 'bar', height: 30 },
      ],
    });
    expect(componentById(engine, 'item-a', 'bar')).toMatchObject({
      size: { width: 60, height: 30 },
    });

    expect(engine.transact({
      strict: true,
      operations: [mergeElement('item-a', [['size', 'width']], [140])],
    })).toMatchObject({ status: 'committed' });
    expect(surface.reconcileCalls[1]?.options).toEqual({
      animateBarChanges: false,
      animatedBarTargets: [],
      allowedComponentOrderOwners: [],
      incrementalRootIds: ['item-a'],
    });
    expect(itemById(engine, 'item-a').size.width).toBe(140);
  });

  it('commits heterogeneous owner updates while animating only the requested authored bar', async () => {
    const { engine, surface } = await createEngine(engines, 'mixed-owner-animation');
    engine.loadDataset(twoOwnerBarScene());

    expect(engine.transact({
      strict: true,
      actionId: 'mixed-owner-animation',
      animatedBarTargets: [{ ownerId: 'item-b', componentId: 'bar' }],
      operations: [
        {
          op: 'merge',
          target: { kind: 'component', ownerId: 'item-a', id: 'bar' },
          changes: [
            { path: ['size', 'height'], value: 30 },
            { path: ['source', 'fill'], value: '#2563eb' },
          ],
        },
        {
          op: 'merge',
          target: { kind: 'component', ownerId: 'item-a', id: 'label' },
          changes: [{ path: ['text'], value: 'Immediate' }],
        },
        {
          op: 'merge',
          target: { kind: 'component', ownerId: 'item-b', id: 'bar' },
          changes: [
            { path: ['size', 'height'], value: 50 },
            { path: ['source', 'fill'], value: '#22c55e' },
          ],
        },
      ],
    })).toMatchObject({
      status: 'committed',
      changed: true,
      history: { recorded: true, depthDelta: 1 },
    });
    expect(surface.reconcileCalls).toHaveLength(1);
    expect(surface.reconcileCalls[0]?.options).toMatchObject({
      animateBarChanges: true,
      animatedBarTargets: [{ ownerId: 'item-b', componentId: 'bar' }],
    });
    expect(componentById(engine, 'item-a', 'bar')).toMatchObject({
      size: { height: 30 },
      source: { fill: '#2563eb' },
    });
    expect(componentById(engine, 'item-a', 'label')).toMatchObject({ text: 'Immediate' });
    expect(componentById(engine, 'item-b', 'bar')).toMatchObject({
      size: { height: 50 },
      source: { fill: '#22c55e' },
    });
  });

  it('commits compact bar batches through direct projection and one history unit', async () => {
    const { engine, surface } = await createEngine(engines, 'compact-bar-batch');
    engine.loadDataset(updateScene());
    const targets = Object.freeze([
      Object.freeze({ ownerId: 'item-a', componentId: 'bar' }),
    ]);
    const heights = new Float64Array([34]);
    const requestBefore = [...heights];

    const result = engine.updateBarHeights({
      targets,
      heights,
      actionId: 'bar-batch-1',
    });
    expect(Object.getOwnPropertyDescriptor(result, 'semanticHash')?.get)
      .toBeTypeOf('function');
    expect(result).toMatchObject({
      status: 'committed',
      changed: true,
      actionId: 'bar-batch-1',
      applied: [{ kind: 'component', ownerId: 'item-a', id: 'bar' }],
      history: {
        recorded: true,
        commandId: 'bar-batch-1',
        depthDelta: 1,
      },
    });
    expect(result.semanticHash).toBe(engine.snapshot().semanticHash);
    expect(engine.selectionIds).toEqual([]);
    expect(engine.publishedFrameRevision).toBe(engine.snapshot().frameRevision);
    expect(surface.reconcileCalls[0]?.options).toEqual({
      animateBarChanges: true,
      animatedBarTargets: [{ ownerId: 'item-a', componentId: 'bar' }],
      allowedComponentOrderOwners: [],
      incrementalRootIds: ['item-a'],
      directBarHeightUpdates: [
        { ownerId: 'item-a', componentId: 'bar', height: 34 },
      ],
    });
    expect(componentById(engine, 'item-a', 'bar'))
      .toMatchObject({ size: { width: 60, height: 34 } });
    expect([...heights]).toEqual(requestBefore);
    expect(targets).toEqual([{ ownerId: 'item-a', componentId: 'bar' }]);

    expect(engine.undo()).toMatchObject({
      status: 'committed',
      direction: 'undo',
      history: { undoDepth: 0, redoDepth: 1 },
    });
    expect(componentById(engine, 'item-a', 'bar'))
      .toMatchObject({ size: { width: 60, height: 10 } });

    const authorityBefore = engine.exportDataset();
    const snapshotBefore = engine.snapshot();
    const historyBefore = engine.historyState();
    expect(engine.updateBarHeights({
      targets: [
        { ownerId: 'item-a', componentId: 'bar' },
        { ownerId: 'missing', componentId: 'bar' },
      ],
      heights: new Float64Array([48, 12]),
      actionId: 'bar-batch-invalid',
    })).toMatchObject({
      status: 'rejected',
      changed: false,
      transactionDiagnostic: {
        code: 'MISSING_TARGET',
        operationIndex: 1,
      },
      history: { recorded: false, depthDelta: 0 },
    });
    expect(engine.exportDataset()).toBe(authorityBefore);
    expect(engine.snapshot()).toEqual(snapshotBefore);
    expect(engine.historyState()).toEqual(historyBefore);
    expect(surface.reconcileCalls).toHaveLength(2);
  });

  it('updates one grid template bar across every expanded cell', async () => {
    const { engine, surface } = await createEngine(engines, 'grid-bar-batch');
    engine.loadDataset(gridBarScene());

    const result = engine.updateBarHeights({
      targets: [{ ownerId: 'grid-a', componentId: 'bar' }],
      heights: new Float64Array([54]),
      actionId: 'grid-bar-batch-1',
    });

    expect(result).toMatchObject({
      status: 'committed',
      changed: true,
      applied: [{ kind: 'component', ownerId: 'grid-a', id: 'bar' }],
    });
    expect(gridComponentById(engine, 'grid-a', 'bar'))
      .toMatchObject({ size: { width: 60, height: 54 } });
    expect(surface.reconcileCalls[0]?.options).toEqual({
      animateBarChanges: true,
      animatedBarTargets: [{ ownerId: 'grid-a', componentId: 'bar' }],
      allowedComponentOrderOwners: [],
      incrementalRootIds: ['grid-a'],
      directBarHeightUpdates: [
        { ownerId: 'grid-a', componentId: 'bar', height: 54 },
      ],
    });

    expect(engine.undo()).toMatchObject({ status: 'committed' });
    expect(gridComponentById(engine, 'grid-a', 'bar'))
      .toMatchObject({ size: { width: 60, height: 10 } });
  });

  it('commits compact text batches atomically and restores them as one history unit', async () => {
    const { engine, surface } = await createEngine(engines, 'compact-text-batch');
    engine.loadDataset(updateScene());
    const targets = Object.freeze([
      Object.freeze({ ownerId: 'item-a', componentId: 'label' }),
    ]);
    const texts = Object.freeze(['Changed']);
    const styles = Object.freeze([
      Object.freeze({ fontSize: 22, fill: '#123456ff' }),
    ]);

    expect(engine.updateTexts({
      targets,
      texts,
      styles,
      actionId: 'text-batch-1',
    })).toMatchObject({
      status: 'committed',
      changed: true,
      actionId: 'text-batch-1',
      applied: [
        { kind: 'component', ownerId: 'item-a', id: 'label' },
      ],
      history: {
        recorded: true,
        commandId: 'text-batch-1',
        depthDelta: 1,
      },
    });
    expect(surface.reconcileCalls[0]?.options).toEqual({
      animateBarChanges: false,
      animatedBarTargets: [],
      allowedComponentOrderOwners: [],
      incrementalRootIds: ['item-a'],
      directTextUpdates: [
        { ownerId: 'item-a', componentId: 'label', text: 'Changed' },
      ],
    });
    expect(componentById(engine, 'item-a', 'label')).toMatchObject({
      text: 'Changed',
      style: { fontSize: 22, fill: '#123456ff' },
    });
    expect(targets).toEqual([
      { ownerId: 'item-a', componentId: 'label' },
    ]);
    expect(texts).toEqual(['Changed']);
    expect(styles).toEqual([{ fontSize: 22, fill: '#123456ff' }]);

    expect(engine.undo()).toMatchObject({
      status: 'committed',
      direction: 'undo',
      history: { undoDepth: 0, redoDepth: 1 },
    });
    expect(componentById(engine, 'item-a', 'label')).toMatchObject({ text: 'Alpha' });

    const authorityBefore = engine.exportDataset();
    const historyBefore = engine.historyState();
    expect(engine.updateTexts({
      targets: [
        { ownerId: 'item-a', componentId: 'label' },
        { ownerId: 'missing', componentId: 'label' },
      ],
      texts: ['Tentative', 'Never published'],
      actionId: 'text-batch-invalid',
    })).toMatchObject({
      status: 'rejected',
      changed: false,
      transactionDiagnostic: {
        code: 'MISSING_TARGET',
        operationIndex: 1,
      },
      history: { recorded: false, depthDelta: 0 },
    });
    expect(engine.exportDataset()).toBe(authorityBefore);
    expect(engine.historyState()).toEqual(historyBefore);
    expect(surface.reconcileCalls).toHaveLength(2);
  });

  it('publishes move/group/ungroup atomically with logical selection, history, and cycle refusal', async () => {
    const { engine, surface } = await createEngine(engines, 'hierarchy-transactions');
    const source = hierarchyUpdateScene();
    const sourceBefore = JSON.stringify(source);
    engine.loadDataset(source);
    engine.select(['rect-b']);

    const moved = engine.transact({
      strict: true,
      actionId: 'structure-1',
      operations: [{
        op: 'move',
        target: { kind: 'element', id: 'rect-b' },
        parent: { kind: 'element', id: 'group-b' },
        index: 0,
      }],
    });
    expect(moved).toMatchObject({
      status: 'committed',
      revisions: { sceneRevision: 2 },
      history: { depthDelta: 1, state: { undoDepth: 1 } },
    });
    expect(parentId(engine.exportDataset(), 'rect-b')).toBe('group-b');
    expect(position(rectById(engine, 'rect-b'))).toEqual([-80, 40]);
    expect(engine.snapshot().selectionIds).toEqual(['rect-b']);
    expect(surface.reconcileCalls[0]?.options.allowedElementOrderIds).toEqual(['rect-b']);

    const grouped = engine.transact({
      strict: true,
      actionId: 'structure-2',
      operations: [{
        op: 'group',
        targets: [{ kind: 'element', id: 'rect-b' }],
        value: { type: 'group', id: 'group-c' },
      }],
    });
    expect(grouped).toMatchObject({
      status: 'committed',
      history: { depthDelta: 1, state: { undoDepth: 2 } },
    });
    expect(parentId(engine.exportDataset(), 'rect-b')).toBe('group-c');
    expect(engine.snapshot().selectionIds).toEqual(['group-c']);
    expect(surface.reconcileCalls[1]?.options.selectionIds).toEqual(['group-c']);

    const ungrouped = engine.transact({
      strict: true,
      actionId: 'structure-3',
      operations: [{
        op: 'ungroup',
        target: { kind: 'element', id: 'group-c' },
        relationPolicy: 'reject',
      }],
    });
    expect(ungrouped).toMatchObject({
      status: 'committed',
      history: { depthDelta: 1, state: { undoDepth: 3 } },
    });
    expect(parentId(engine.exportDataset(), 'rect-b')).toBe('group-b');
    expect(engine.snapshot().selectionIds).toEqual(['rect-b']);
    expect(surface.reconcileCalls[2]?.options.selectionIds).toEqual(['rect-b']);

    expect(engine.undo()).toMatchObject({
      status: 'committed',
      direction: 'undo',
      history: { undoDepth: 2, redoDepth: 1 },
    });
    expect(parentId(engine.exportDataset(), 'rect-b')).toBe('group-c');
    expect(engine.snapshot().selectionIds).toEqual(['group-c']);
    expect(surface.reconcileCalls[3]?.options.allowedElementOrderIds).toEqual([
      'group-c',
      'rect-b',
    ]);
    expect(engine.redo()).toMatchObject({
      status: 'committed',
      direction: 'redo',
      history: { undoDepth: 3, redoDepth: 0 },
    });
    expect(parentId(engine.exportDataset(), 'rect-b')).toBe('group-b');
    expect(engine.snapshot().selectionIds).toEqual(['rect-b']);
    expect(surface.reconcileCalls[4]?.options.allowedElementOrderIds).toEqual([
      'group-c',
      'rect-b',
    ]);

    const unrecorded = engine.transact({
      strict: true,
      recordHistory: false,
      operations: [{
        op: 'move',
        target: { kind: 'element', id: 'group-a' },
        parent: { kind: 'element', id: 'group-b' },
        index: 1,
      }],
    });
    expect(unrecorded).toMatchObject({
      status: 'committed',
      history: { recorded: false, depthDelta: 0, state: { undoDepth: 3 } },
    });
    const beforeCycle = engine.snapshot();
    const cycle = engine.transact({
      strict: true,
      operations: [{
        op: 'move',
        target: { kind: 'element', id: 'group-b' },
        parent: { kind: 'element', id: 'group-a' },
        index: 0,
      }],
    });
    expect(cycle).toMatchObject({
      status: 'rejected',
      diagnostic: { code: 'CONFLICT', category: 'CONFLICT' },
      transactionDiagnostic: { code: 'CONFLICT', category: 'CONFLICT' },
      history: { depthDelta: 0, state: { undoDepth: 3 } },
    });
    expect(engine.snapshot()).toEqual(beforeCycle);
    expect(surface.reconcileCalls).toHaveLength(6);
    expect(JSON.stringify(source)).toBe(sourceBefore);
  });

  it('commits authoring actions through one reconcile/history boundary and leaves invalid attempts atomic', async () => {
    const { engine, surface } = await createEngine(engines, 'authoring-actions');
    engine.loadDataset([
      ...updateScene(),
      {
        type: 'text',
        id: 'text-c',
        text: 'Bravo',
        style: { fontFamily: 'FiraCode', fontSize: 16, fill: '#222222' },
        size: { width: 80, height: 20 },
        attrs: { x: 40, y: 140 },
      },
    ]);

    expect(engine.author({
      type: 'edit-position-angle',
      target: 'rect-b',
      x: 200,
      y: 100,
      angleDegrees: 30,
      actionId: 'position-1',
    })).toMatchObject({
      status: 'committed',
      code: null,
      transaction: { history: { depthDelta: 1 } },
      history: { undoDepth: 1 },
    });
    expect(engine.author({
      type: 'align-targets',
      targets: ['item-a', 'rect-b', 'text-c'],
      axis: 'left',
      actionId: 'align-1',
    })).toMatchObject({
      status: 'committed',
      transaction: { history: { depthDelta: 1 } },
      history: { undoDepth: 2 },
    });
    const firstDistribution = engine.author({
      type: 'distribute-targets',
      targets: ['item-a', 'rect-b', 'text-c'],
      axis: 'horizontal',
      basis: 'bounds',
      actionId: 'distribute-1',
    });
    const secondDistribution = engine.author({
      type: 'distribute-targets',
      targets: ['item-a', 'rect-b', 'text-c'],
      axis: 'horizontal',
      basis: 'bounds',
      actionId: 'distribute-2',
    });
    expect(firstDistribution).toMatchObject({
      status: 'committed',
      history: { undoDepth: 3 },
    });
    expect(firstDistribution.facts.distributionDigest).toMatch(/^fnv1a32:/);
    expect(secondDistribution).toMatchObject({
      status: 'unchanged',
      transaction: null,
      facts: { distributionDigest: firstDistribution.facts.distributionDigest },
      history: { undoDepth: 3 },
    });

    const beforeInvalidDistribution = engine.snapshot();
    expect(engine.author({
      type: 'distribute-targets',
      targets: ['item-a', 'rect-b'],
      axis: 'horizontal',
      basis: 'bounds',
      actionId: 'invalid-distribution',
    })).toMatchObject({
      status: 'rejected',
      changed: false,
      code: 'INVALID_VALUE',
      plan: { diagnostic: { path: ['targets'] } },
      transaction: null,
      history: { undoDepth: 3 },
    });
    expect(engine.snapshot()).toEqual(beforeInvalidDistribution);

    expect(engine.author({
      type: 'apply-style',
      target: 'text-c',
      changes: {
        alpha: 0.8,
        fill: '#112233',
        stroke: '#445566',
        strokeWidth: 2,
        cornerRadius: 4,
        fontSize: 18,
        letterSpacing: 1,
        lineHeight: 22,
      },
      strict: true,
      actionId: 'style-1',
    })).toMatchObject({
      status: 'committed',
      history: { undoDepth: 4 },
    });
    const beforeInvalidStyle = engine.snapshot();
    expect(engine.author({
      type: 'apply-style',
      target: 'text-c',
      changes: { alpha: 2 },
      strict: true,
      actionId: 'style-invalid',
    })).toMatchObject({
      status: 'rejected',
      code: 'INVALID_VALUE',
      plan: { diagnostic: { path: ['alpha'] } },
      history: { undoDepth: 4 },
    });
    expect(engine.snapshot()).toEqual(beforeInvalidStyle);
    expect(surface.reconcileCalls).toHaveLength(4);
    expect(engine.snapshot()).toMatchObject({
      selectionIds: ['text-c'],
      historyDepth: 4,
    });
  });

  it('restores a grouped structural command with one boundary-scoped order permission', async () => {
    const { engine, surface } = await createEngine(engines, 'grouped-structural-history');
    engine.loadDataset([
      rectRecord('a', 0, 0),
      rectRecord('b', 50, 0),
      rectRecord('c', 100, 0),
    ]);

    for (const id of ['c', 'b']) {
      expect(engine.transact({
        strict: true,
        actionId: 'drag-order',
        operations: [{
          op: 'move',
          target: { kind: 'element', id },
          parent: null,
          index: 0,
        }],
      })).toMatchObject({ status: 'committed' });
    }
    expect(engine.exportDataset().map(({ id }) => id)).toEqual(['b', 'c', 'a']);
    expect(engine.historyInspection().commands).toMatchObject([
      { id: 'drag-order', recordCount: 2 },
    ]);

    expect(engine.undo()).toMatchObject({ status: 'committed', direction: 'undo' });
    expect(engine.exportDataset().map(({ id }) => id)).toEqual(['a', 'b', 'c']);
    expect(surface.reconcileCalls[2]?.options.allowedElementOrderIds).toEqual(['a', 'b', 'c']);

    expect(engine.redo()).toMatchObject({ status: 'committed', direction: 'redo' });
    expect(engine.exportDataset().map(({ id }) => id)).toEqual(['b', 'c', 'a']);
    expect(surface.reconcileCalls[3]?.options.allowedElementOrderIds).toEqual(['a', 'b', 'c']);
  });

  it('retains dense component selection identity while rejecting unknown logical targets', async () => {
    const { engine } = await createEngine(engines, 'component-logical-selection');
    engine.loadDataset(updateScene());

    expect(engine.select(['item-a::bar:bar', 'missing'])).toEqual(['item-a::bar:bar']);
    expect(engine.snapshot().selectionIds).toEqual(['item-a::bar:bar']);
  });

  it('ingests host-prepared text and image batches with atomic selection and cleanup facts', async () => {
    const { engine, surface } = await createEngine(engines, 'host-asset-ingestion');
    engine.loadDataset(updateScene());
    const files = [
      { name: 'a.png', mime: 'image/png', bytes: 1_024 },
      { name: 'b.png', mime: 'image/png', bytes: 2_048 },
    ];
    const before = structuredClone(files);

    expect(engine.ingestHostAsset({
      kind: 'text',
      idPrefix: 'pasted',
      text: 'Line 1\r\nLine 2',
      targetWorld: [400, 300],
      activeEditor: false,
    })).toMatchObject({
      status: 'committed',
      createdTextId: 'pasted-text-1',
    });
    expect(elementById(engine, 'pasted-text-1')).toMatchObject({
      type: 'text',
      text: 'Line 1\r\nLine 2',
    });

    expect(engine.ingestHostAsset({
      kind: 'images',
      idPrefix: 'pasted',
      source: 'paste',
      files,
      targetWorld: [420, 320],
      insideCanvas: true,
    })).toMatchObject({
      status: 'committed',
      createdImageIds: ['pasted-image-1', 'pasted-image-2'],
    });
    expect(engine.ingestHostAsset({
      kind: 'images',
      idPrefix: 'pasted',
      source: 'drop',
      files,
      targetWorld: [440, 340],
      insideCanvas: true,
    })).toMatchObject({
      status: 'committed',
      createdImageIds: ['pasted-image-3', 'pasted-image-4'],
    });
    expect(surface.selectionIds).toEqual(['pasted-image-3', 'pasted-image-4']);
    expect(engine.snapshot().selectionIds).toEqual(['pasted-image-3', 'pasted-image-4']);

    expect(engine.ingestHostAsset({
      kind: 'images',
      idPrefix: 'pasted',
      source: 'drop',
      files: [files[0]!],
      targetWorld: [0, 0],
      insideCanvas: false,
    })).toMatchObject({
      status: 'ignored',
      changed: false,
      createdImageIds: [],
      probe: { ignoredOutsideDropCount: 1 },
    });
    expect(engine.ingestHostAsset({
      kind: 'failure',
      code: 'ASSET_DECODE_FAILED',
      compressionFailureTargetScoped: true,
      activeEditorClipboardNotStolen: true,
      outsideDropNotStolen: true,
    })).toMatchObject({
      status: 'failed',
      code: 'ASSET_DECODE_FAILED',
      changed: false,
      probe: { failedAssetTemporaryResources: 0 },
    });
    expect(engine.hostAssetIngestionProbe()).toEqual({
      textSequence: 1,
      imageSequence: 4,
      ignoredOutsideDropCount: 1,
      failedAssetTemporaryResources: 0,
    });
    expect(files).toEqual(before);
    expect(engine.historyInspection().commands.slice(-3)).toMatchObject([
      { recordCount: 1 },
      { recordCount: 1 },
      { recordCount: 1 },
    ]);
  });
});

function updateScene(): readonly unknown[] {
  return [
    {
      type: 'item',
      id: 'item-a',
      size: { width: 100, height: 80 },
      padding: 4,
      attrs: { x: 10, y: 20 },
      components: [
        backgroundComponent(),
        barComponent(),
        textComponent('label', 'Alpha'),
      ],
    },
    rectRecord('rect-b', 160, 40),
  ];
}

function twoOwnerBarScene(): readonly unknown[] {
  return [
    {
      type: 'item',
      id: 'item-a',
      size: { width: 100, height: 80 },
      attrs: { x: 10, y: 20 },
      components: [barComponent(), textComponent('label', 'Alpha')],
    },
    {
      type: 'item',
      id: 'item-b',
      size: { width: 100, height: 80 },
      attrs: { x: 130, y: 20 },
      components: [barComponent(), textComponent('label', 'Beta')],
    },
  ];
}

function hierarchyUpdateScene(): readonly unknown[] {
  return [
    {
      type: 'group',
      id: 'group-a',
      attrs: { x: 0, y: 0 },
      children: [rectRecord('rect-b', 160, 40)],
    },
    {
      type: 'group',
      id: 'group-b',
      attrs: { x: 240, y: 0 },
      children: [],
    },
  ];
}

function gridBarScene(): readonly unknown[] {
  return [{
    type: 'grid',
    id: 'grid-a',
    cells: [[1, 1], [1, 0]],
    gap: 4,
    item: {
      size: { width: 100, height: 80 },
      padding: 4,
      components: [backgroundComponent(), barComponent()],
    },
  }];
}

function rectRecord(id: string, x: number, y: number): Readonly<Record<string, unknown>> {
  return {
    type: 'rect',
    id,
    size: { width: 40, height: 30 },
    fill: '#ff8800',
    attrs: { x, y, zIndex: 2 },
  };
}

function backgroundComponent(): Readonly<Record<string, PatchMapMutationJsonValue>> {
  return {
    type: 'background',
    id: 'bg',
    source: { type: 'rect', fill: '#336699' },
  };
}

function barComponent(): Readonly<Record<string, PatchMapMutationJsonValue>> {
  return {
    type: 'bar',
    id: 'bar',
    source: { type: 'rect', fill: '#00aa66' },
    size: { width: 60, height: 10 },
    placement: 'bottom',
    animation: true,
    animationDuration: 200,
  };
}

function textComponent(
  id: string,
  text: string,
): Readonly<Record<string, PatchMapMutationJsonValue>> {
  return {
    type: 'text',
    id,
    text,
    placement: 'center',
    style: { fontFamily: 'FiraCode', fontSize: 16, fill: '#111111' },
  };
}

function reorderedComponents(): readonly Readonly<Record<string, PatchMapMutationJsonValue>>[] {
  return Object.freeze([
    textComponent('label', 'Alpha'),
    barComponent(),
    backgroundComponent(),
    textComponent('status', 'Ready'),
  ]);
}

function relationScene(): readonly unknown[] {
  return [
    rectRecord('a', 10, 20),
    rectRecord('b', 100, 40),
    {
      type: 'relations',
      id: 'links',
      links: [
        { source: 'a', target: 'a' },
        { source: 'a', target: 'b' },
        { source: 'b', target: 'a' },
      ],
      style: { color: '#222222', width: 2 },
    },
  ];
}

function mergeElement(
  id: string,
  paths: readonly (readonly string[])[],
  values: readonly (string | number | boolean)[],
) {
  return {
    op: 'merge' as const,
    target: { kind: 'element' as const, id },
    changes: paths.map((path, index) => ({
      path,
      value: requireAt(values, index),
    })),
  };
}

function rectById(engine: PatchMap, id: string): PatchMapRectElement {
  const element = elementById(engine, id);
  if (element.type !== 'rect') throw new Error(`Expected rect ${id}`);
  return element;
}

function itemById(engine: PatchMap, id: string): PatchMapItemElement {
  const element = elementById(engine, id);
  if (element.type !== 'item') throw new Error(`Expected item ${id}`);
  return element;
}

function gridById(engine: PatchMap, id: string): PatchMapGridElement {
  const element = elementById(engine, id);
  if (element.type !== 'grid') throw new Error(`Expected grid ${id}`);
  return element;
}

function relationById(
  engine: PatchMap,
  id: string,
): Extract<PatchMapElement, { readonly type: 'relations' }> {
  const element = elementById(engine, id);
  if (element.type !== 'relations') throw new Error(`Expected relations ${id}`);
  return element;
}

function elementById(engine: PatchMap, id: string): PatchMapElement {
  const element = findElement(engine.exportDataset(), id);
  if (element === undefined) throw new Error(`Missing element ${id}`);
  return element;
}

function findElement(elements: readonly PatchMapElement[], id: string): PatchMapElement | undefined {
  for (const element of elements) {
    if (element.id === id) return element;
    if (element.type !== 'group') continue;
    const nested = findElement(element.children, id);
    if (nested !== undefined) return nested;
  }
  return undefined;
}

function parentId(elements: readonly PatchMapElement[], id: string): string | null | undefined {
  for (const element of elements) {
    if (element.id === id) return null;
    if (element.type !== 'group') continue;
    if (element.children.some((child) => child.id === id)) return element.id;
    const nested = parentId(element.children, id);
    if (nested !== undefined) return nested;
  }
  return undefined;
}

function componentById(engine: PatchMap, ownerId: string, id: string) {
  const component = itemById(engine, ownerId).components.find((candidate) => candidate.id === id);
  if (component === undefined) throw new Error(`Missing component ${ownerId}/${id}`);
  return component;
}

function gridComponentById(engine: PatchMap, ownerId: string, id: string) {
  const component = gridById(engine, ownerId).item.components.find(
    (candidate) => candidate.id === id,
  );
  if (component === undefined) throw new Error(`Missing grid component ${ownerId}/${id}`);
  return component;
}

function position(rect: PatchMapRectElement): readonly [number, number] {
  const x = rect.attrs?.x;
  const y = rect.attrs?.y;
  if (typeof x !== 'number' || typeof y !== 'number') throw new Error(`Missing position ${rect.id}`);
  return Object.freeze([x, y]);
}

function authoredVisibleCenter(rect: PatchMapRectElement): readonly [number, number] {
  const [x, y] = position(rect);
  const angle = typeof rect.attrs?.angle === 'number'
    ? rect.attrs.angle
    : typeof rect.attrs?.rotation === 'number'
      ? rect.attrs.rotation * 180 / Math.PI
      : 0;
  const radians = angle * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const halfWidth = rect.size.width / 2;
  const halfHeight = rect.size.height / 2;
  return Object.freeze([
    x + halfWidth * cosine - halfHeight * sine,
    y + halfWidth * sine + halfHeight * cosine,
  ]);
}

function requireAt<T>(values: readonly T[], index: number): T {
  const value = values[index];
  if (value === undefined) throw new Error(`Missing value at ${index}`);
  return value;
}
