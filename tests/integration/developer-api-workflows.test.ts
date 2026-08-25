import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createPatchMapApi,
  type PatchMapPointerHoverEvent,
  type PatchMapPointerSelectionChange,
  type PatchMapPointerTooltipEvent,
} from '../../src/public';
import { PatchMap } from '../../src/engine';
import * as PublicPackage from '../../src';
import { PatchMap as PublicPatchMap } from '../../src';
import type { PatchMapViewportState } from '../../src/engine/contracts/viewport';
import { createEngine } from '../support/engine-update-transaction-surface';
import { createHost } from './developer-api-host';

describe('PatchMap developer API workflows', () => {
  const engines: PatchMap[] = [];

  afterEach(async () => {
    await Promise.all(engines.splice(0).map((engine) => engine.destroy()));
  });

  it('publishes one real atomic scene commit without mutating the caller update', async () => {
    const { engine, surface } = await createEngine(engines, 'developer-api-atomic');
    engine.loadDataset([{
      type: 'item',
      id: 'rack',
      attrs: { x: 0, y: 0 },
      size: { width: 100, height: 120 },
      components: [
        {
          type: 'bar',
          id: 'usage',
          source: { type: 'rect', fill: '#2563eb' },
          size: { width: 80, height: 40 },
          placement: 'bottom',
          animation: true,
        },
        {
          type: 'text',
          id: 'label',
          text: '40',
          placement: 'top',
          style: { fontSize: 12, fill: '#111827' },
        },
      ],
    }]);
    const input = Object.freeze({
      id: 'rack',
      bar: Object.freeze({
        height: 72,
        changes: Object.freeze({
          source: Object.freeze({ fill: '#22c55e' }),
        }),
      }),
      text: Object.freeze({
        text: '정상',
        style: Object.freeze({ fill: '#ffffff' }),
      }),
    });

    expect(engine.update(input, { actionId: 'rack-live-state' })).toMatchObject({
      status: 'committed',
      changed: true,
      appliedCount: 2,
    });
    expect(surface.reconcileCalls).toHaveLength(1);
    expect(input).toEqual({
      id: 'rack',
      bar: { height: 72, changes: { source: { fill: '#22c55e' } } },
      text: { text: '정상', style: { fill: '#ffffff' } },
    });
    const rack = engine.exportDataset()[0];
    expect(rack?.type).toBe('item');
    if (rack?.type !== 'item') throw new Error('expected item result');
    expect(rack.components[0]).toMatchObject({
      id: 'usage',
      size: { width: 80, height: 72 },
      source: { type: 'rect', fill: '#22c55e' },
    });
    expect(rack.components[1]).toMatchObject({
      id: 'label',
      text: '정상',
      style: { fontSize: 12, fill: '#ffffff' },
    });
  });

  it('exposes editor workflow, previewable transform sessions, and history companion state', async () => {
    const { engine } = await createEngine(engines, 'developer-api-editor-sessions');
    engine.data.replace([{
      type: 'grid',
      id: 'grid',
      cells: [[1, 'B'], [0, 1]],
      item: { size: 10, components: [] },
    }], { fit: false });

    expect(engine.editor.execute({
      type: 'enter-grid-edit',
      target: 'grid',
      linkedCellIds: ['grid.0.1'],
    })).toMatchObject({
      status: 'committed',
      state: { mode: 'grid-edit', activeTargetId: 'grid' },
    });
    expect(engine.editor.state).toMatchObject({
      mode: 'grid-edit',
      activeTargetId: 'grid',
    });

    engine.data.replace([{
      type: 'rect',
      id: 'rect',
      attrs: { x: 10, y: 20 },
      size: { width: 80, height: 40 },
    }], { fit: false });
    const session = engine.transform.beginSession({
      targets: { id: 'rect' },
      kind: 'move',
      actionId: 'drag-rect',
    });
    const preview = session.preview({ kind: 'move', delta: [12, -4] });
    expect(preview).toMatchObject({
      status: 'previewed',
      changed: true,
    });
    expect(Object.keys(preview).sort()).toEqual(['changed', 'status']);
    const edgePan = session.edgePan([799, 300], [4, 0]);
    expect(edgePan.pointerWorldBefore).toHaveLength(2);
    expect(edgePan.pointerWorldAfter).toHaveLength(2);
    const committedSession = session.commit();
    expect(committedSession).toMatchObject({
      status: 'committed',
      historyDepthDelta: 1,
    });
    expect(Object.keys(committedSession).sort()).toEqual([
      'changed',
      'historyDepthDelta',
      'mutationCount',
      'status',
    ]);

    const historyStates: number[] = [];
    const release = engine.history.onChange((state) => historyStates.push(state.undoDepth));
    expect(engine.transaction([{
      type: 'update',
      id: 'rect',
      changes: { attrs: { x: 40 } },
    }], {
      actionId: 'host-editor-state',
      selectedIds: ['rect'],
      companion: { panel: 'properties', draft: 2 },
    })).toMatchObject({ status: 'committed' });
    const undone = engine.history.undo();
    expect(undone).toMatchObject({
      status: 'committed',
      companion: null,
    });
    expect(Object.keys(undone).sort()).toEqual([
      'changed',
      'companion',
      'direction',
      'history',
      'previousRevisions',
      'revisions',
      'sceneRevision',
      'semanticHash',
      'status',
    ]);
    const redone = engine.history.redo();
    expect(redone).toMatchObject({
      status: 'committed',
      companion: { panel: 'properties', draft: 2 },
    });
    expect(historyStates).toEqual([2, 1, 2]);
    release();
  });

  it('refuses edge-pan through a public session token after replacement cancels ownership', async () => {
    const { engine } = await createEngine(engines, 'developer-api-stale-transform');
    const scene = [{
      type: 'rect',
      id: 'rect',
      attrs: { x: 0, y: 0 },
      size: { width: 20, height: 20 },
    }];
    engine.data.replace(scene, { fit: false });
    const session = engine.transform.beginSession({
      targets: { id: 'rect' },
      kind: 'move',
      actionId: 'stale-drag',
    });
    engine.data.replace(scene, { fit: false });
    const before = engine.viewport.snapshot();

    expect(() => session.edgePan([799, 300], [4, 0])).toThrow('CONFLICT');
    expect(engine.viewport.snapshot()).toEqual(before);
  });

  it('invalidates a public transform token before commit change callbacks run', async () => {
    const { engine } = await createEngine(engines, 'developer-api-transform-reentrancy');
    engine.data.replace([{
      type: 'rect',
      id: 'rect',
      attrs: { x: 0, y: 0 },
      size: { width: 20, height: 20 },
    }], { fit: false });
    const session = engine.transform.beginSession({
      targets: { id: 'rect' },
      kind: 'move',
      actionId: 'reentrant-drag',
    });
    session.preview({ kind: 'move', delta: [8, 0] });
    const before = engine.viewport.snapshot();
    let callbackObserved = false;
    const release = engine.on('change', () => {
      callbackObserved = true;
      expect(() => session.edgePan([799, 300], [4, 0])).toThrow('CONFLICT');
    });

    expect(session.commit()).toMatchObject({ status: 'committed' });
    expect(callbackObserved).toBe(true);
    expect(engine.viewport.snapshot()).toEqual(before);
    release();
  });

  it('loads and fits through one high-level call', () => {
    const harness = createHost();
    const map = createPatchMapApi(harness.host);

    expect('load' in map.data).toBe(false);
    expect('export' in map.data).toBe(false);
    expect(map.data.replace([], { datasetRef: 'dashboard' })).toEqual({
      rootIds: ['rack-grid'],
      semanticHash: 'hash',
      sceneRevision: 2,
    });
    expect(harness.fitViewport).toHaveBeenCalledOnce();
  });

  it('preflights replacement fit targets before committing a dataset', async () => {
    const source = createHost();
    const destination = createHost();
    const sourceMap = createPatchMapApi(source.host);
    const destinationMap = createPatchMapApi(destination.host);
    const foreignTargets = sourceMap.targets.query({ type: 'bar', scope: 'instances' });

    expect(() => destinationMap.data.replace([], {
      fit: { targets: foreignTargets },
    })).toThrow('target set belongs to another PatchMap instance');
    expect(destination.loadDataset).not.toHaveBeenCalled();

    await expect(destinationMap.data.replaceAsync([], {
      fit: { targets: foreignTargets },
    })).rejects.toThrow('target set belongs to another PatchMap instance');
    expect(destination.loadDatasetAsync).not.toHaveBeenCalled();
  });

  it('preflights replacement fit padding before committing a dataset', () => {
    const harness = createHost();
    const map = createPatchMapApi(harness.host);

    expect(() => map.data.replace([], {
      fit: { padding: -1 },
    })).toThrow('viewport padding must contain two finite non-negative values');
    expect(harness.loadDataset).not.toHaveBeenCalled();
  });

  it('maps common editor and capture work without exposing low-level request envelopes', async () => {
    const harness = createHost();
    const map = createPatchMapApi(harness.host);

    expect('move' in map.transform).toBe(false);
    expect('pan' in map.viewport).toBe(false);
    expect('inspect' in map.assets).toBe(false);
    expect(map.transform.moveBy({ id: 'rack-grid.12.3' }, [8, 4], {
      actionId: 'drag-rack',
    })).toMatchObject({ status: 'committed' });
    expect(harness.lastTransformRequest()).toEqual({
      kind: 'move',
      selectionIds: ['rack-grid.12.3'],
      deltaWorld: [8, 4],
    });
    expect(map.selection.set('rack-grid.12.3')).toEqual(['rack-grid.12.3']);
    const selectionChanges: Array<readonly string[]> = [];
    const releaseSelection = map.selection.onChange((ids) => selectionChanges.push(ids));
    harness.publishSelection(['rack-grid.12.3']);
    expect(selectionChanges).toEqual([['rack-grid.12.3']]);
    releaseSelection();
    expect(map.viewport.resize(720, 480, 2)).toBe(true);
    expect(harness.resize).toHaveBeenCalledWith(720, 480, 2);
    await expect(map.capture.png()).resolves.toEqual({
      dataUrl: 'data:image/png;base64,AAAA',
      mime: 'image/png',
      size: [640, 360],
    });
  });

  it('snapshots, restores, and coalesces absolute viewport settlement', () => {
    vi.useFakeTimers();
    try {
      const harness = createHost();
      const map = createPatchMapApi(harness.host);
      expect(map.viewport.snapshot()).toEqual({ centerWorld: [0, 0], scale: 1 });
      expect(Object.isFrozen(map.viewport.snapshot().centerWorld)).toBe(true);

      map.viewport.restore({ centerWorld: [120, -40], scale: 2.5 });
      expect(harness.setViewportAbsolute).toHaveBeenCalledWith({
        centerWorld: [120, -40],
        scale: 2.5,
      });
      expect(map.viewport.snapshot()).toEqual({ centerWorld: [120, -40], scale: 2.5 });

      const settled: PatchMapViewportState[] = [];
      const release = map.viewport.onSettled((state) => settled.push(state));
      harness.publishViewportChange(Object.freeze({
        centerWorld: Object.freeze([130, -30] as const),
        scale: 2.5,
        screenBounds: Object.freeze([0, 0, 640, 360] as const),
      }));
      vi.advanceTimersByTime(60);
      harness.publishViewportChange(Object.freeze({
        centerWorld: Object.freeze([140, -20] as const),
        scale: 3,
        screenBounds: Object.freeze([0, 0, 640, 360] as const),
      }));
      vi.advanceTimersByTime(99);
      expect(settled).toEqual([]);
      vi.advanceTimersByTime(1);
      expect(settled).toEqual([{
        centerWorld: [140, -20],
        scale: 3,
        screenBounds: [0, 0, 640, 360],
      }]);

      harness.publishViewportChange(Object.freeze({
        centerWorld: Object.freeze([150, -10] as const),
        scale: 3,
        screenBounds: Object.freeze([0, 0, 640, 360] as const),
      }));
      harness.publishDestroyed();
      vi.advanceTimersByTime(100);
      expect(settled).toHaveLength(1);
      release();
    } finally {
      vi.useRealTimers();
    }
  });

  it('projects root hover and pointer selection through disposer-based public domains', () => {
    const harness = createHost();
    const map = createPatchMapApi(harness.host);
    const hoverEvents: PatchMapPointerHoverEvent[] = [];
    const selectionEvents: PatchMapPointerSelectionChange[] = [];
    const releaseHover = map.pointer.onHover((event) => hoverEvents.push(event));
    const releaseSelection = map.selection.onPointerChange((change) => {
      selectionEvents.push(change);
    });
    const target = Object.freeze({ id: 'rack-grid.12.3', componentId: 'status' });
    const hover = Object.freeze({
      type: 'hover' as const,
      target,
      previousTarget: null,
      anchor: Object.freeze([44, 52] as const),
      world: Object.freeze([22, 26] as const),
      pointerId: 1,
      pointerType: 'mouse',
      modifiers: Object.freeze({ shift: false, ctrl: false, alt: false, meta: false }),
    });
    const selection = Object.freeze({
      source: 'pointer' as const,
      selected: Object.freeze([target]),
      added: Object.freeze([target]),
      removed: Object.freeze([]),
      interactionRevision: 4,
    });

    harness.publishPointerHover(hover);
    harness.publishPointerSelection(selection);
    expect(hoverEvents).toEqual([hover]);
    expect(selectionEvents).toEqual([selection]);

    releaseHover();
    releaseSelection();
    harness.publishPointerHover(hover);
    harness.publishPointerSelection(selection);
    expect(hoverEvents).toHaveLength(1);
    expect(selectionEvents).toHaveLength(1);
  });

  it('projects package-owned tooltip pin events through a disposer', () => {
    const harness = createHost();
    const map = createPatchMapApi(harness.host);
    const events: PatchMapPointerTooltipEvent[] = [];
    const release = map.pointer.onTooltip((event) => events.push(event));
    const event = Object.freeze({
      type: 'pin' as const,
      target: Object.freeze({ id: 'rack-grid.12.3', componentId: 'status' }),
      previousTarget: null,
      anchor: Object.freeze([44, 52] as const),
      world: Object.freeze([22, 26] as const),
      pointerId: 1,
      pointerType: 'mouse',
      modifiers: Object.freeze({ shift: false, ctrl: false, alt: false, meta: false }),
      pinned: true,
    });

    harness.publishPointerTooltip(event);
    expect(events).toEqual([event]);
    release();
    harness.publishPointerTooltip(event);
    expect(events).toHaveLength(1);
  });

  it('ships one product surface plus the named asset-runtime extension', () => {
    expect(PublicPatchMap).not.toBe(PatchMap);
    expect(() => Reflect.construct(PublicPatchMap as unknown as new () => object, [])).toThrow(
      'PatchMap cannot be constructed directly; use PatchMap.mount(...)',
    );
    expect(typeof PublicPatchMap.mount).toBe('function');
    expect(Object.keys(PublicPackage).sort()).toEqual([
      'PATCH_MAP_BUILTIN_ASSETS',
      'PatchMap',
      'PatchMapAssetError',
      'PatchMapAssetRuntime',
      'PatchMapError',
      'createPatchMapAssetIngestionPolicy',
      'createPatchMapPixiAssetBackend',
    ]);
    for (const internalName of [
      'PatchMapAdvanced',
      'PatchMapFrameLoop',
      'PatchMapPixiRenderer',
      'parsePatchMap',
      'planPatchMapMutationTransaction',
    ]) {
      expect(internalName in PublicPackage).toBe(false);
    }
  });

  it('explains a missing mount target before allocating renderer resources', async () => {
    await expect(PublicPatchMap.mount({ container: '#missing-patch-map-host' })).rejects.toThrow(
      'Create the container element before mounting',
    );
  });
});
