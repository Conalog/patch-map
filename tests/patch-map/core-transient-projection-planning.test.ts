import { describe, expect, it } from 'vitest';

import type { EntityRef } from '../../src/patch-map/dense/contracts';
import type { PatchMapScene } from '../../src/patch-map/scene';
import {
  assembleOwnedPatchMapSparsePreviewDataset,
  materializePatchMapDataset,
} from '../../src/patch-map/semantic/dataset';
import { parsePatchMapV010 } from '../../src/patch-map/parser';
import {
  preparePatchMapIncrementalPreview,
  preparePatchMapSemanticRefresh,
  preparePatchMapTransientDirtyRanges,
} from '../../src/patch-map/core/transient-projection-planning';
import {
  indexPatchMapComponentProbeTargets,
  indexPatchMapTextProbeTargets,
} from '../../src/patch-map/core/product-probe-reader';
import { patchMapComponentProbeTargetKey } from '../../src/patch-map/core/component-target-key';
import { incrementalParseOptionsKey } from '../../src/patch-map/core/reconcile-planning';
import { semanticSelectionDenseIds } from '../../src/patch-map/core/semantic-dense-planning';
import type { PatchMapPublishedSceneState } from '../../src/patch-map/core/published-scene-state';
import { PatchMapRuntime } from '../../src/patch-map/core';

describe('PatchMap transient projection planning', () => {
  it('prepares one frozen sparse preview candidate without publishing state', () => {
    const current = materializePatchMapDataset(fixtureInput());
    const replacement = materializePatchMapDataset([
      { type: 'rect', id: 'rect-b', size: { width: 28, height: 10 } },
    ]).dataset[0]!;
    const preview = assembleOwnedPatchMapSparsePreviewDataset(current, [
      { index: 1, root: replacement },
    ]);
    const parse = parsePatchMapV010(current.dataset);
    const published = publishedState(parse, current.dataset);
    const before = published.transientIncrementalParse;

    const prepared = preparePatchMapIncrementalPreview(
      preview.dataset,
      ['rect-b'],
      {},
      published,
    );

    expect(prepared).toMatchObject({
      base: parse,
      dirtyRootIds: ['rect-b'],
      dirtyIndices: [1],
      dirtyRoots: [replacement],
      entityIds: parse.identity.entityIdsBySourceId['rect-b'],
    });
    expect(prepared?.selected.projection.byEntityId['rect-b']?.localBounds)
      .toEqual([0, 0, 28, 10]);
    expect(Object.isFrozen(prepared)).toBe(true);
    expect(Object.isFrozen(prepared?.entityIds)).toBe(true);
    expect(published.transientIncrementalParse).toBe(before);
    expect(preparePatchMapIncrementalPreview(
      preview.dataset,
      ['rect-b', 'rect-b'],
      {},
      published,
    )).toBeNull();
  });

  it('resolves preview and refresh ranges without retaining scene state', () => {
    const scene = slotScene(new Map([
      ['first', 4],
      ['second', 5],
      ['third', 8],
    ]));

    expect(preparePatchMapTransientDirtyRanges(
      ['third', 'missing', 'second', 'first', 'second'],
      scene,
    )).toEqual([
      { start: 4, end: 6 },
      { start: 8, end: 9 },
    ]);
  });

  it('prepares ordered semantic refresh facts and refuses strict misses before slot reads', () => {
    const parse = parsePatchMapV010(fixtureInput());
    const componentTargets = indexPatchMapComponentProbeTargets(parse);
    const component = componentTargets.get(patchMapComponentProbeTargetKey({
      ownerId: 'item-a',
      componentId: 'label-a',
    }));
    if (!component) throw new Error('Expected an indexed text component');
    const elementId = semanticSelectionDenseIds(parse, ['rect-b'])[0];
    if (elementId === undefined) throw new Error('Expected a dense rect entity');
    const slots = new Map([
      [component.entityId, 4],
      [elementId, 5],
    ]);
    const scene = slotScene(slots);

    const prepared = preparePatchMapSemanticRefresh(
      [
        { kind: 'component', ownerId: 'item-a', id: 'label-a' },
        { kind: 'element', id: 'rect-b' },
        { kind: 'element', id: 'missing' },
      ],
      {},
      parse,
      componentTargets,
      scene,
    );

    expect(prepared).toEqual({
      changed: true,
      recomputedTargets: ['item-a/label-a', 'rect-b'],
      missingTargets: ['missing'],
      dirtyRanges: [{ start: 4, end: 6 }],
      dataDiffCount: 0,
    });
    expect(Object.isFrozen(prepared)).toBe(true);
    expect(Object.isFrozen(prepared.dirtyRanges)).toBe(true);

    let strictRefReads = 0;
    const strict = preparePatchMapSemanticRefresh(
      [
        { kind: 'component', ownerId: 'item-a', id: 'label-a' },
        { kind: 'element', id: 'missing' },
      ],
      { strict: true },
      parse,
      componentTargets,
      {
        ref(): EntityRef | null {
          strictRefReads += 1;
          return null;
        },
      },
    );
    expect(strict).toEqual({
      changed: false,
      recomputedTargets: [],
      missingTargets: ['missing'],
      dirtyRanges: [],
      dataDiffCount: 0,
    });
    expect(strictRefReads).toBe(0);
  });

  it('keeps preview publication in the Core facade after pure preparation', () => {
    const current = materializePatchMapDataset(fixtureInput());
    const replacement = materializePatchMapDataset([
      { type: 'rect', id: 'rect-b', size: { width: 28, height: 10 } },
    ]).dataset[0]!;
    const preview = assembleOwnedPatchMapSparsePreviewDataset(current, [
      { index: 1, root: replacement },
    ]);
    let published = publishedState(parsePatchMapV010(current.dataset), current.dataset);
    const order: string[] = [];
    const facade = {
      parseOptions: {},
      assertAlive(): void {},
      updatePublishedScene(patch: Partial<PatchMapPublishedSceneState>): void {
        order.push(patch.transientIncrementalParse === null ? 'clear' : 'publish');
        published = Object.freeze({ ...published, ...patch });
      },
      publishedScene: {
        current(): PatchMapPublishedSceneState {
          return published;
        },
      },
      barPresentation: {
        applyTransientEntityProjections(): typeof published.projection {
          order.push('bar');
          return published.projection;
        },
      },
      scene: {
        ref(id: string): EntityRef | null {
          order.push(`ref:${id}`);
          return Object.freeze({ slot: 4, generation: 1 });
        },
      },
      renderer: {
        setProjection(): void {
          order.push('renderer');
        },
      },
      spatialHit: {
        staleProjectionIds: new Set<string>(),
        invalidate(): void {
          order.push('spatial');
        },
      },
      framePublication: {
        componentRendererFactsPublished: true,
        textRendererFactsPublished: true,
        renderedSceneRevision: 7 as number | null,
        markProjectionFactsStale(): void {
          order.push('facts-stale');
          this.componentRendererFactsPublished = false;
          this.textRendererFactsPublished = false;
          this.renderedSceneRevision = null;
        },
        invalidate(): void {
          order.push('invalidate');
        },
      },
    };

    const result = PatchMapRuntime.prototype.previewIncrementalRoots.call(
      facade as unknown as PatchMapRuntime,
      preview.dataset,
      ['rect-b'],
    );

    expect(order).toEqual([
      'clear',
      'publish',
      'bar',
      'ref:rect-b',
      'renderer',
      'facts-stale',
      'spatial',
      'invalidate',
    ]);
    expect(result).toEqual({
      changed: true,
      entityIds: ['rect-b'],
      dirtyRanges: [{ start: 4, end: 5 }],
    });
    expect(facade.framePublication.componentRendererFactsPublished).toBe(false);
    expect(facade.framePublication.textRendererFactsPublished).toBe(false);
    expect(facade.framePublication.renderedSceneRevision).toBeNull();
  });
});

function publishedState(
  parse: ReturnType<typeof parsePatchMapV010>,
  dataset: readonly unknown[],
): PatchMapPublishedSceneState {
  const optionsKey = incrementalParseOptionsKey({});
  if (optionsKey === null) throw new Error('Expected default parse options key');
  return Object.freeze({
    scene: Object.freeze({}) as unknown as PatchMapScene,
    parse,
    projection: parse.projection,
    ownedInputDataset: dataset,
    ownedParseOptionsKey: optionsKey,
    transientIncrementalParse: null,
    componentTargets: indexPatchMapComponentProbeTargets(parse),
    textTargets: indexPatchMapTextProbeTargets(parse),
    entityCount: parse.document.entities.length,
  });
}

function slotScene(
  slots: ReadonlyMap<string, number>,
): Readonly<{ ref(id: string): EntityRef | null }> {
  return Object.freeze({
    ref(id: string): EntityRef | null {
      const slot = slots.get(id);
      return slot === undefined ? null : Object.freeze({ slot, generation: 1 });
    },
  });
}

function fixtureInput(): readonly Readonly<Record<string, unknown>>[] {
  return [
    {
      type: 'item',
      id: 'item-a',
      size: { width: 100, height: 80 },
      components: [{
        type: 'text',
        id: 'label-a',
        text: 'Before',
        placement: 'center',
        style: { fill: '#111111ff', fontSize: 12 },
      }],
    },
    {
      type: 'rect',
      id: 'rect-b',
      size: { width: 20, height: 10 },
    },
  ];
}
