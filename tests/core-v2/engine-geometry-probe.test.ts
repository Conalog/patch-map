import { describe, expect, it } from 'vitest';

import type { SceneSnapshot } from '../../src/core-v1/contracts';
import {
  CoreV2Engine,
  createCoreV2SurfaceGeometrySnapshot,
  PixiEngineSurface,
} from '../../src/core-v2/engine';

describe('CoreV2Engine renderer-aligned geometry probe', () => {
  it('projects entity, relation, and selected bounds through the active view', () => {
    const snapshot: SceneSnapshot = {
      revision: 7,
      view: { x: 112, y: 84, scale: 2, rotation: 0 },
      entityCount: 4,
      entities: [
        {
          ref: { slot: 0, generation: 1 },
          id: 'item-a',
          kind: 'rect',
          bounds: { x: 10, y: 20, width: 100, height: 80 },
          rotation: 0,
          opacity: 1,
          visible: true,
          interactive: true,
          zIndex: 1,
          tags: [],
          data: {},
        },
        {
          ref: { slot: 1, generation: 1 },
          id: 'rect-b',
          kind: 'rect',
          bounds: { x: 160, y: 40, width: 40, height: 30 },
          rotation: 0,
          opacity: 1,
          visible: true,
          interactive: true,
          zIndex: 2,
          tags: [],
          data: {},
        },
        {
          ref: { slot: 2, generation: 1 },
          id: 'text-c',
          kind: 'text',
          bounds: { x: 40, y: 140, width: 80, height: 20 },
          rotation: 0,
          opacity: 1,
          visible: true,
          interactive: true,
          zIndex: 0,
          tags: [],
          data: {},
        },
        {
          ref: { slot: 3, generation: 1 },
          id: 'links:0',
          kind: 'relation',
          bounds: { x: 0, y: 0, width: 0, height: 0 },
          rotation: 0,
          opacity: 1,
          visible: true,
          interactive: false,
          zIndex: 0,
          tags: [],
          data: { from: 'item-a', to: 'rect-b' },
        },
      ],
      selection: {
        revision: 1,
        refs: [{ slot: 1, generation: 1 }],
      },
    };

    const geometry = createCoreV2SurfaceGeometrySnapshot(snapshot);

    expect(geometry).toMatchObject({ revision: 7, sceneRevision: 7 });
    expect(geometry.entities).toHaveLength(3);
    expect(geometry.entities[1]).toMatchObject({
      id: 'rect-b',
      worldBounds: [160, 40, 40, 30],
      screenBounds: [432, 164, 80, 60],
    });
    expect(geometry.relations).toEqual([
      expect.objectContaining({
        id: 'links:0',
        sourceId: 'item-a',
        targetId: 'rect-b',
        worldEndpoints: [[60, 60], [180, 55]],
        screenEndpoints: [[232, 204], [472, 194]],
      }),
    ]);
    expect(geometry.selectionOverlay).toEqual({
      screenBounds: [432, 164, 80, 60],
    });
    expect(Object.isFrozen(geometry)).toBe(true);
    expect(Object.isFrozen(geometry.relations[0]?.screenEndpoints)).toBe(true);
    expect(Object.isFrozen(geometry.selectionOverlay?.screenBounds)).toBe(true);
  });

  it('uses stable ref identity and omits dangling relation endpoints', () => {
    const snapshot: SceneSnapshot = {
      revision: 1,
      view: { x: 0, y: 0, scale: 1, rotation: 0 },
      entityCount: 2,
      entities: [
        {
          ref: { slot: 0, generation: 2 },
          id: 'rect-a',
          kind: 'rect',
          bounds: { x: 0, y: 0, width: 10, height: 10 },
          rotation: 45,
          opacity: 1,
          visible: true,
          interactive: true,
          zIndex: 0,
          tags: [],
          data: {},
        },
        {
          ref: { slot: 1, generation: 1 },
          id: 'dangling',
          kind: 'relation',
          bounds: { x: 0, y: 0, width: 0, height: 0 },
          rotation: 0,
          opacity: 1,
          visible: true,
          interactive: false,
          zIndex: 0,
          tags: [],
          data: { from: 'rect-a', to: 'missing' },
        },
      ],
      selection: {
        revision: 1,
        refs: [{ slot: 0, generation: 1 }],
      },
    };

    const geometry = createCoreV2SurfaceGeometrySnapshot(snapshot);

    expect(geometry.relations).toEqual([]);
    expect(geometry.selectionOverlay).toBeNull();
    expect(geometry.entities[0]?.screenBounds[2]).toBeCloseTo(Math.sqrt(200), 9);
    expect(geometry.entities[0]?.screenBounds[3]).toBeCloseTo(Math.sqrt(200), 9);
  });

  it('invalidates cached geometry after selection and resize surface mutations', () => {
    let selected = false;
    let snapshotCalls = 0;
    const entity = {
      ref: { slot: 0, generation: 1 },
      id: 'selected',
      kind: 'rect' as const,
      bounds: { x: 10, y: 20, width: 30, height: 40 },
      rotation: 0,
      opacity: 1,
      visible: true,
      interactive: true,
      zIndex: 0,
      tags: [],
      data: {},
    };
    const relation = {
      ref: { slot: 1, generation: 1 },
      id: 'self-link',
      kind: 'relation' as const,
      bounds: { x: 0, y: 0, width: 0, height: 0 },
      rotation: 0,
      opacity: 1,
      visible: true,
      interactive: false,
      zIndex: 1,
      tags: [],
      data: { from: 'selected', to: 'selected', lineWidth: 2 },
    };
    const core = {
      destroyed: false,
      projection: null,
      snapshot: (): SceneSnapshot => {
        snapshotCalls += 1;
        return {
          revision: 1,
          view: { x: 0, y: 0, scale: 1, rotation: 0 },
          entityCount: 2,
          entities: [entity, relation],
          selection: {
            revision: selected ? 1 : 0,
            refs: selected ? [entity.ref] : [],
          },
        };
      },
      load: () => {},
      reconcile: () => ({
        status: 'committed',
        plan: { summary: { operationCount: 1 }, diagnostics: [] },
        facts: { denseChanged: true },
      }),
      commit: () => {
        selected = true;
      },
      selectSemantic: () => {
        selected = true;
      },
      resize: () => true,
      setWorldTransform: () => {},
    };
    const surface = new PixiEngineSurface(core as never);

    const beforeSelection = surface.geometrySnapshot();
    expect(beforeSelection.selectionOverlay).toBeNull();
    expect(surface.geometrySnapshot()).toBe(beforeSelection);
    expect(surface.relationHitTestScreen({ x: 42.5, y: 10 })).toMatchObject({
      id: 'self-link',
    });
    expect(surface.relationHitTestScreen({ x: 42.5, y: 10 })).not.toBeNull();
    expect(snapshotCalls).toBe(1);

    expect(surface.reconcile([])).toMatchObject({ status: 'committed' });
    const afterMutation = surface.geometrySnapshot();
    expect(afterMutation).not.toBe(beforeSelection);
    expect(afterMutation.revision).toBeGreaterThan(beforeSelection.revision ?? -1);

    surface.setView({ x: 0, y: 0, scale: 1, rotation: 0 });
    const afterView = surface.geometrySnapshot();
    expect(afterView).not.toBe(afterMutation);
    expect(afterView.revision).toBeGreaterThan(afterMutation.revision ?? -1);

    surface.select(['selected']);
    const afterSelection = surface.geometrySnapshot();
    expect(afterSelection).not.toBe(afterView);
    expect(afterSelection.revision).toBeGreaterThan(afterView.revision ?? -1);
    expect(afterSelection.selectionOverlay?.screenBounds).toEqual([10, 20, 30, 40]);

    expect(surface.resize(640, 480, 2)).toBe(true);
    const afterResize = surface.geometrySnapshot();
    expect(afterResize).not.toBe(afterSelection);
    expect(afterResize.revision).toBeGreaterThan(afterSelection.revision ?? -1);
  });

  it('correlates surface generations with Engine scene, view, and interaction revisions', async () => {
    let surfaceRevision = 0;
    let denseRevision = 0;
    let selectionIds: readonly string[] = [];
    const surface = {
      canvasCount: 0,
      destroyed: false,
      load() {
        surfaceRevision += 1;
        denseRevision += 1;
      },
      publishFrame() {},
      resize() { return false; },
      setView() { surfaceRevision += 1; },
      select(ids: readonly string[]) {
        selectionIds = ids;
        surfaceRevision += 1;
        denseRevision += 1;
      },
      debugSnapshot: () => ({
        cssSize: [800, 600],
        backingSize: [800, 600],
        selectionIds,
        activeAnimationCount: 0,
        activeGestureCount: 0,
        renderCommandCount: 0,
        visiblePrimitiveCount: 0,
      }),
      geometrySnapshot: () => ({
        revision: surfaceRevision,
        // Deliberately use a different dense revision domain. Engine probes
        // must correlate the surface generation instead of subtracting this.
        sceneRevision: denseRevision,
        entities: [],
        relations: [],
        selectionOverlay: null,
      }),
      destroy() { return Promise.resolve(true); },
    };
    const engine = new CoreV2Engine({
      surfaceFactory: () => Promise.resolve(surface as never),
    });
    await engine.initialize({ instanceId: 'geometry-revision-domains', width: 800, height: 600 });
    engine.loadDataset([{
      type: 'rect',
      id: 'rect-a',
      size: { width: 20, height: 10 },
      attrs: { x: 0, y: 0 },
    }]);

    const loaded = engine.geometryProbe();
    expect(loaded).toMatchObject({
      revision: 1,
      surfaceRevision: 1,
      representedRevisions: { scene: 1, view: 0, interaction: 0 },
      revisionLags: { scene: 0, view: 0, interaction: 0 },
      revisionLag: 0,
    });
    expect(loaded).not.toHaveProperty('sceneRevision');

    engine.setViewport({ centerWorld: [20, 10], scale: 2 });
    const viewed = engine.geometryProbe();
    expect(viewed).toMatchObject({
      revision: 1,
      surfaceRevision: 2,
      representedRevisions: { scene: 1, view: 1, interaction: 0 },
      revisionLags: { scene: 0, view: 0, interaction: 0 },
      revisionLag: 0,
    });

    engine.select(['rect-a']);
    const selected = engine.geometryProbe();
    expect(selected).toMatchObject({
      revision: 1,
      surfaceRevision: 3,
      representedRevisions: { scene: 1, view: 1, interaction: 1 },
      revisionLags: { scene: 0, view: 0, interaction: 0 },
      revisionLag: 0,
    });
    expect(selected?.surfaceRevision).toBeGreaterThan(viewed?.surfaceRevision ?? -1);
    expect(selected?.revisionLag).toBeGreaterThanOrEqual(0);
    await engine.destroy();
  });

  it('rebuilds cached geometry when decoded image projection changes without a scene revision', () => {
    const image = {
      ref: { slot: 0, generation: 1 },
      id: 'intrinsic',
      kind: 'image' as const,
      bounds: { x: 10, y: 20, width: 32, height: 32 },
      rotation: 0,
      opacity: 1,
      visible: true,
      interactive: true,
      zIndex: 0,
      tags: [],
      data: { source: 'fixture-image' },
    };
    let projection = imageProjection(32, 32);
    const core = {
      destroyed: false,
      get visibleProjection() { return projection; },
      snapshot: (): SceneSnapshot => ({
        revision: 1,
        view: { x: 0, y: 0, scale: 1, rotation: 0 },
        entityCount: 1,
        entities: [image],
        selection: { revision: 0, refs: [] },
      }),
    };
    const surface = new PixiEngineSurface(core as never);

    const provisional = surface.geometrySnapshot();
    expect(provisional.entities[0]?.worldBounds).toEqual([10, 20, 32, 32]);

    projection = imageProjection(80, 40);
    const resolved = surface.geometrySnapshot();
    expect(resolved).not.toBe(provisional);
    expect(provisional.revision).toBe(1);
    expect(provisional.sceneRevision).toBe(1);
    expect(resolved.revision).toBe(2);
    expect(resolved.sceneRevision).toBe(1);
    expect(resolved.entities[0]?.worldBounds).toEqual([10, 20, 80, 40]);
  });

  it('enriches scene image probes without retaining a data URI in public evidence', () => {
    const entities: SceneSnapshot['entities'] = [
      imageSnapshot('alias', 0, 0, 1, 2),
      imageSnapshot('data-uri', 20, 0, 0.5, 3),
    ];
    const core = {
      destroyed: false,
      projection: null,
      snapshot: (): SceneSnapshot => ({
        revision: 2,
        view: { x: 0, y: 0, scale: 1, rotation: 0 },
        entityCount: entities.length,
        entities,
        selection: { revision: 0, refs: [] },
      }),
      hitBounds: (id: string) => id === 'alias'
        ? [0, 0, 10, 10]
        : [20, 0, 10, 10],
      sceneImageProbe: () => ({
        destroyed: false,
        targetCount: 2,
        activeTargetCount: 2,
        bindingCount: 2,
        pendingBindingCount: 0,
        pendingSettlementCount: 0,
        pendingReleaseCount: 0,
        diagnosticCount: 0,
        staleAttachCount: 0,
        staleCompletionCount: 0,
        diagnostics: [],
        abandonedRequests: {
          pendingSettlementCount: 0,
          pendingReleaseCount: 0,
          staleAttachmentCount: 0,
        },
        images: {
          alias: rawImageProbe('alias', 'fixture-image', 'alias'),
          'data-uri': rawImageProbe(
            'data-uri',
            'data:image/svg+xml,%3Csvg%2F%3E',
            'data-uri',
          ),
        },
      }),
    };
    const surface = new PixiEngineSurface(core as never);

    const probe = surface.sceneImageProbe();

    expect(probe.images.alias).toMatchObject({
      authoredSource: 'fixture-image',
      opacity: 1,
      zIndex: 2,
      hitBounds: [0, 0, 10, 10],
      initial: { authoredSource: 'fixture-image', state: 'resolved' },
    });
    expect(probe.images['data-uri']).toMatchObject({
      authoredSourceKind: 'data-uri',
      opacity: 0.5,
      zIndex: 3,
      hitBounds: [20, 0, 10, 10],
      initial: { authoredSourceKind: 'data-uri', state: 'resolved' },
    });
    expect(Object.hasOwn(probe.images['data-uri']!, 'authoredSource')).toBe(false);
    expect(JSON.stringify(probe)).not.toContain('data:image/svg+xml');
  });
});

function imageProjection(width: number, height: number) {
  return {
    byEntityId: {
      intrinsic: {
        entityId: 'intrinsic',
        localBounds: [0, 0, width, height] as const,
        affine: [1, 0, 0, 1, 10, 20] as const,
        worldBasis: [1, 0, 0, 1] as const,
        visibleCenter: [10 + width / 2, 20 + height / 2] as const,
        rotationDegrees: 0,
        scaleX: 1,
        scaleY: 1,
        contentOrientation: 'follow-item' as const,
      },
    },
  };
}

function imageSnapshot(
  id: string,
  x: number,
  y: number,
  opacity: number,
  zIndex: number,
): SceneSnapshot['entities'][number] {
  return {
    ref: { slot: zIndex, generation: 1 },
    id,
    kind: 'image',
    bounds: { x, y, width: 10, height: 10 },
    rotation: 0,
    opacity,
    visible: true,
    interactive: true,
    zIndex,
    tags: [],
    data: { source: id },
  };
}

function rawImageProbe(
  entityId: string,
  authoredSource: string,
  sourceKind: 'alias' | 'data-uri',
) {
  const attempt = {
    generation: 1,
    bindingKey: `${sourceKind}:${entityId}`,
    authoredSource,
    sourceKind,
    dimensionMode: 'authored' as const,
    sourceCacheIdentity: `${sourceKind}:${entityId}`,
    resourceState: 'resolved' as const,
    attachmentState: 'current' as const,
    rendererGeneration: 1,
    cacheIdentity: `${sourceKind}:${entityId}`,
    normalizedResourceIdentity: `${entityId}@1`,
    naturalSize: [10, 10] as const,
    reusedResolvedResource: false,
    diagnosticCount: 0,
  };
  return {
    entityId,
    active: true,
    generation: 1,
    authoredSource,
    sourceKind,
    dimensionMode: 'authored' as const,
    bindingKey: `${sourceKind}:${entityId}`,
    sourceCacheIdentity: `${sourceKind}:${entityId}`,
    state: 'resolved' as const,
    attachmentState: 'current' as const,
    cacheIdentity: `${sourceKind}:${entityId}`,
    normalizedResourceIdentity: `${entityId}@1`,
    naturalSize: [10, 10] as const,
    reusedResolvedResource: false,
    renderObjectCount: 1 as const,
    role: 'image' as const,
    rendererGeneration: 1,
    staleAttachCount: 0,
    staleCompletionCount: 0,
    diagnosticCount: 0,
    attempts: [attempt],
  };
}
