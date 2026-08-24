import { afterEach, describe, expect, it } from 'vitest';

import type { PatchMapTextProductProbe, PatchMapTextTarget } from '../../src/patch-map/core';
import type { ParsePatchMapResult } from '../../src/patch-map/contracts';
import {
  PatchMap,
  type PatchMapEngineSurface,
  type PatchMapPoint,
  type PatchMapSurfaceDebug,
  type PatchMapSurfaceReconcileResult,
  type PatchMapSurfaceView,
} from '../../src/patch-map/engine';
import { readPatchMapEngineTextProbe } from '../../src/patch-map/engine/product-probe-reader';
import { parsePatchMapV010 } from '../../src/patch-map/parser';
import type {
  PatchMapEntityPaintProbe,
  PatchMapRenderLaneRole,
  PatchMapRenderLaneSnapshot,
  PatchMapTextRendererProbe,
} from '../../src/patch-map/renderers/types';

describe('PatchMap O(1) text product seam', () => {
  const engines: PatchMap[] = [];

  afterEach(async () => {
    await Promise.allSettled(engines.splice(0).map(async (engine) => engine.destroy()));
  });

  it('correlates pending/current revisions and never publishes a superseded rapid value', async () => {
    const surface = new IndexedTextSurface();
    const engine = await createEngine(engines, surface, 'text-publication');
    const input = directTextDataset('old');
    const before = structuredClone(input);
    engine.loadDataset(input, { datasetRef: 'authored-direct-text' });

    const pending = engine.textProbe(elementTarget());
    expect(input).toEqual(before);
    expect(pending).toMatchObject({
      semantic: { source: 'old', show: true },
      entityId: 'text',
      projection: { source: 'old', visibleText: 'old' },
      renderer: { objectKind: 'none', objectCount: 0 },
      publication: {
        status: 'pending',
        revisions: {
          current: { sceneRevision: 1 },
          published: { scene: 0 },
          frameRevision: 0,
          surfaceSceneRevision: 1,
          surfaceRenderedSceneRevision: null,
          rendererFrame: null,
        },
      },
      availability: {
        semantic: true,
        surface: true,
        renderer: false,
        rendererPaint: false,
        renderLanes: false,
      },
    });

    engine.publishFrame(1);
    const initial = engine.textProbe(elementTarget());
    expect(initial).toMatchObject({
      renderer: {
        attachedRoute: 'pixi-text',
        objectKind: 'pixi-text',
        objectCount: 1,
        staleGlyphCount: 0,
      },
      publication: {
        status: 'current',
        revisions: {
          current: { sceneRevision: 1 },
          published: { scene: 1 },
          frameRevision: 1,
          surfaceRenderedSceneRevision: 1,
          rendererFrame: 1,
        },
      },
      availability: {
        renderer: true,
        rendererPaint: true,
        renderLanes: true,
      },
    });
    surface.corruptLastRenderedLayout(elementTarget());
    expect(engine.textProbe(elementTarget())?.publication.status).toBe('pending');

    expect(engine.patch(elementTarget(), { text: 'intermediate' })).toMatchObject({
      status: 'committed',
      publication: 'pending',
    });
    expect(engine.patch(elementTarget(), { text: 'final中' })).toMatchObject({
      status: 'committed',
      publication: 'pending',
    });
    expect(engine.textProbe(elementTarget())).toMatchObject({
      semantic: { source: 'final中' },
      projection: { source: 'final中', visibleText: 'final中' },
      publication: {
        status: 'pending',
        revisions: {
          current: { sceneRevision: 3 },
          published: { scene: 1 },
        },
      },
    });
    expect(surface.publishedSources).toEqual(['old']);

    engine.publishFrame(16.666667);
    const final = engine.textProbe(elementTarget());
    expect(final).toMatchObject({
      semantic: { source: 'final中' },
      renderer: { staleGlyphCount: 0 },
      publication: {
        status: 'current',
        revisions: {
          current: { sceneRevision: 3 },
          published: { scene: 3 },
          frameRevision: 2,
          surfaceSceneRevision: 3,
          surfaceRenderedSceneRevision: 3,
          rendererFrame: 2,
        },
      },
    });
    expect(surface.reconciledSources).toEqual(['intermediate', 'final中']);
    expect(surface.publishedSources).toEqual(['old', 'final中']);
    expect(surface.publishedSources).not.toContain('intermediate');
    expect(Object.isFrozen(final)).toBe(true);
    expect(Object.isFrozen(final?.publication)).toBe(true);
    expect(Object.isFrozen(final?.publication.revisions)).toBe(true);
  });

  it('joins element and component semantic indexes and refuses an ambiguous grid template', async () => {
    const surface = new IndexedTextSurface();
    const engine = await createEngine(engines, surface, 'text-targets');

    engine.loadDataset(itemTextDataset());
    expect(engine.textProbe(componentTarget('item-a', 'label'))).toMatchObject({
      semantic: {
        target: { kind: 'component', ownerId: 'item-a', id: 'label' },
        semanticOwnerId: 'item-a',
        source: 'item label',
        placement: 'right-bottom',
        margin: { top: 2, right: 2, bottom: 2, left: 2 },
        split: 0,
        show: true,
        contentOrientation: 'upright',
      },
      semanticOwnerId: 'item-a',
      entityId: 'item-a::text:label',
      availability: { semantic: true, surface: true },
    });

    engine.loadDataset(gridTextDataset());
    expect(engine.textProbe(componentTarget('grid-a', 'label'))).toBeNull();
    expect(engine.textProbe(componentTarget('grid-a.0.0', 'label'))).toMatchObject({
      semantic: {
        target: { kind: 'component', ownerId: 'grid-a', id: 'label' },
        semanticOwnerId: 'grid-a',
        source: 'grid label',
      },
      semanticOwnerId: 'grid-a',
      entityId: 'grid-a.0.0::text:label',
      projection: { ownerId: 'grid-a.0.0', componentId: 'label' },
      availability: { semantic: true, surface: true },
    });
    expect(engine.textProbe(componentTarget('grid-a.0.1', 'label'))).toMatchObject({
      semanticOwnerId: 'grid-a',
      entityId: 'grid-a.0.1::text:label',
    });
  });

  it('reports hidden text pending until a successful frame then absent', async () => {
    const surface = new IndexedTextSurface();
    const engine = await createEngine(engines, surface, 'text-absence');
    engine.loadDataset(directTextDataset('hidden', false));

    expect(engine.textProbe(elementTarget())).toMatchObject({
      semantic: { source: 'hidden', show: false },
      state: { visible: false },
      renderer: {
        attachedRoute: null,
        objectKind: 'none',
        objectCount: 0,
        attachedSignatures: null,
        lastRenderedSignatures: null,
        staleGlyphCount: 0,
      },
      rendererPaint: null,
      renderLanes: null,
      publication: { status: 'pending' },
    });
    engine.publishFrame(1);
    expect(engine.textProbe(elementTarget())?.publication.status).toBe('absent');

    expect(engine.destroyTarget(elementTarget())).toMatchObject({ status: 'committed' });
    expect(engine.textProbe(elementTarget())).toBeNull();
    await engine.destroy();
    expect(engine.textProbe(elementTarget())).toBeNull();
  });

  it('truthfully exposes semantic-only availability for a legacy injected surface', async () => {
    const surface = new LegacyTextSurface();
    const engine = await createEngine(engines, surface, 'text-legacy');
    engine.loadDataset([
      ...directTextDataset('semantic only'),
      ...itemTextDataset(),
    ]);

    const element = engine.textProbe(elementTarget());
    expect(element).toMatchObject({
      semantic: {
        target: { kind: 'element', id: 'text' },
        source: 'semantic only',
        authoredStyle: { fontFamily: 'Unifont' },
      },
      entityId: null,
      projection: null,
      geometry: null,
      state: null,
      transform: null,
      renderer: null,
      rendererPaint: null,
      renderLanes: null,
      publication: { status: 'unavailable' },
      availability: {
        semantic: true,
        surface: false,
        renderer: false,
        rendererPaint: false,
        renderLanes: false,
      },
    });
    expect(engine.textProbe(componentTarget('item-a', 'label'))).toMatchObject({
      semantic: { source: 'item label' },
      availability: { semantic: true, surface: false },
    });
    expect(engine.textProbe({ kind: 'element', id: 'missing' })).toBeNull();
    expect(Object.isFrozen(element?.semantic)).toBe(true);
    expect(Object.isFrozen(element?.semantic?.authoredStyle)).toBe(true);
  });

  it('is deterministic across fresh indexed sessions', async () => {
    const firstSurface = new IndexedTextSurface();
    const secondSurface = new IndexedTextSurface();
    const first = await createEngine(engines, firstSurface, 'text-determinism-a');
    const second = await createEngine(engines, secondSurface, 'text-determinism-b');
    const input = itemTextDataset();
    first.loadDataset(input);
    second.loadDataset(input);
    first.publishFrame(4);
    second.publishFrame(4);

    expect(first.textProbe(componentTarget('item-a', 'label'))).toEqual(
      second.textProbe(componentTarget('item-a', 'label')),
    );
  });

  it('does not add a dataset or Pixi traversal fallback to the Engine probe', () => {
    const facade = PatchMap.prototype.textProbe.toString();
    const source = readPatchMapEngineTextProbe.toString();

    expect(facade).toContain('readPatchMapEngineTextProbe');
    expect(source).toContain('state.textSemantic');
    expect(source).toContain('state.textProbe');
    expect(source).not.toContain('findElement');
    expect(source).not.toMatch(/\.snapshot\s*\(/u);
    expect(source).not.toContain('.children');
  });
});

class LegacyTextSurface implements PatchMapEngineSurface {
  public canvasCount = 1;
  public destroyed = false;
  protected view: PatchMapSurfaceView = Object.freeze({ x: 0, y: 0, scale: 1, rotation: 0 });
  protected selectionIds: readonly string[] = Object.freeze([]);

  public load(_input: unknown): void {}
  public publishFrame(): void {}
  public resize(): boolean { return false; }
  public setView(view: PatchMapSurfaceView): void { this.view = Object.freeze({ ...view }); }
  public select(ids: readonly string[]): void { this.selectionIds = Object.freeze([...ids]); }
  public hitTestScreen(): string | null { return null; }
  public screenToWorld(point: PatchMapPoint): PatchMapPoint { return Object.freeze({ ...point }); }
  public debugSnapshot(): PatchMapSurfaceDebug {
    return Object.freeze({
      cssSize: Object.freeze([320, 240] as const),
      backingSize: Object.freeze([320, 240] as const),
      selectionIds: this.selectionIds,
      activeAnimationCount: 0,
    });
  }
  public destroy(): Promise<boolean> {
    if (this.destroyed) return Promise.resolve(false);
    this.destroyed = true;
    this.canvasCount = 0;
    return Promise.resolve(true);
  }
}

class IndexedTextSurface extends LegacyTextSurface {
  public readonly reconciledSources: string[] = [];
  public readonly publishedSources: string[] = [];

  private parsed: ParsePatchMapResult | null = null;
  private probes = new Map<string, PatchMapTextProductProbe | null>();
  private surfaceSceneRevision = 0;
  private renderedSceneRevision: number | null = null;
  private frame = 0;

  public override load(input: unknown): void {
    this.parsed = parsePatchMapV010(input);
    this.surfaceSceneRevision += 1;
    this.rebuildProbes();
  }

  public reconcile(input: unknown): PatchMapSurfaceReconcileResult {
    this.parsed = parsePatchMapV010(input);
    this.surfaceSceneRevision += 1;
    this.reconciledSources.push(...this.currentSources());
    this.rebuildProbes();
    return Object.freeze({
      status: 'committed',
      operationCount: 1,
      denseChanged: true,
      diagnostics: Object.freeze([]),
    });
  }

  public override publishFrame(): void {
    this.frame += 1;
    this.renderedSceneRevision = this.surfaceSceneRevision;
    this.rebuildProbes();
    this.publishedSources.push(...this.currentSources());
  }

  public textProbe(target: PatchMapTextTarget): PatchMapTextProductProbe | null {
    return this.probes.get(textTargetKey(target)) ?? null;
  }

  public corruptLastRenderedLayout(target: PatchMapTextTarget): void {
    const key = textTargetKey(target);
    const probe = this.probes.get(key);
    if (!probe?.renderer.lastRenderedSignatures) {
      throw new Error('current text probe required before corruption');
    }
    this.probes.set(key, Object.freeze({
      ...probe,
      renderer: Object.freeze({
        ...probe.renderer,
        lastRenderedSignatures: Object.freeze({
          ...probe.renderer.lastRenderedSignatures,
          layout: 'tampered-layout-signature',
        }),
      }),
    }));
  }

  public override destroy(): Promise<boolean> {
    this.parsed = null;
    this.probes.clear();
    return super.destroy();
  }

  private currentSources(): string[] {
    return Object.values(this.parsed?.projection.textsByEntityId ?? {})
      .map(({ source }) => source)
      .sort();
  }

  private rebuildProbes(): void {
    const parsed = this.parsed;
    const probes = new Map<string, PatchMapTextProductProbe | null>();
    if (!parsed) {
      this.probes = probes;
      return;
    }
    const entities = new Map(parsed.document.entities.map((entity) => [entity.id, entity] as const));
    for (const entityId of Object.keys(parsed.projection.textsByEntityId ?? {}).sort()) {
      const semantic = parsed.projection.textsByEntityId?.[entityId];
      const projection = parsed.projection.byEntityId[entityId];
      const entity = entities.get(entityId);
      if (!semantic || !projection || !entity || entity.kind !== 'text') continue;
      const semanticOwnerId = parsed.identity.entitySourceById[entityId]?.sourceElementId ?? entityId;
      const target: PatchMapTextTarget = semantic.targetKind === 'element'
        ? Object.freeze({ kind: 'element', id: semanticOwnerId })
        : Object.freeze({
            kind: 'component',
            ownerId: semantic.ownerId ?? semanticOwnerId,
            id: semantic.componentId ?? '',
          });
      const probe = createSurfaceProbe({
        target,
        semanticOwnerId,
        entity,
        semantic,
        projection,
        surfaceSceneRevision: this.surfaceSceneRevision,
        renderedSceneRevision: this.renderedSceneRevision,
        frame: this.frame,
      });
      addSurfaceProbe(probes, target, probe);
      if (target.kind === 'component' && semanticOwnerId !== target.ownerId) {
        addSurfaceProbe(probes, {
          kind: 'component',
          ownerId: semanticOwnerId,
          id: target.id,
        }, probe);
      }
    }
    this.probes = probes;
  }
}

function createSurfaceProbe(input: Readonly<{
  target: PatchMapTextTarget;
  semanticOwnerId: string;
  entity: Extract<ParsePatchMapResult['document']['entities'][number], { readonly kind: 'text' }>;
  semantic: NonNullable<NonNullable<ParsePatchMapResult['projection']['textsByEntityId']>[string]>;
  projection: ParsePatchMapResult['projection']['byEntityId'][string];
  surfaceSceneRevision: number;
  renderedSceneRevision: number | null;
  frame: number;
}>): PatchMapTextProductProbe {
  const visible = input.entity.visible ?? true;
  const synchronized = input.renderedSceneRevision === input.surfaceSceneRevision;
  const current = visible && synchronized;
  const absent = !visible && synchronized;
  const signatures = Object.freeze({
    content: input.semantic.contentSignature,
    style: input.semantic.styleSignature,
    layout: input.semantic.layoutSignature,
  });
  const attached = current
    ? Object.freeze({ ...signatures, renderer: `indexed:${input.semantic.layoutSignature}` })
    : null;
  const renderer: PatchMapTextRendererProbe = Object.freeze({
    entityId: input.entity.id,
    attachedRoute: current ? 'pixi-text' : 'none',
    objectKind: current ? 'pixi-text' : 'none',
    routeDecisionReason: current ? 'atlas-coverage-unproven' : 'not-attached',
    objectCount: current ? 1 : 0,
    semanticSignatures: signatures,
    attachedSignatures: attached,
    lastRenderedSignatures: attached,
    publicationStatus: current || absent ? 'current' : 'pending',
    lastRenderedFrame: current || absent ? input.frame : null,
    staleGlyphCount: 0,
  });
  const x = input.projection.affine[4];
  const y = input.projection.affine[5];
  const local = input.projection.localBounds;
  const world = Object.freeze([x, y, local[2], local[3]] as const);
  const paint: PatchMapEntityPaintProbe | null = current
    ? Object.freeze({
        entityId: input.entity.id,
        lane: 'text',
        rendererKind: 'text',
        primitiveCount: 1,
        renderObjectCount: 1,
        packedTint: input.semantic.color,
        rgbTint: input.semantic.color >>> 8,
        alpha: (input.semantic.color & 0xff) / 255,
      })
    : null;
  return Object.freeze({
    target: input.target,
    semanticOwnerId: input.semanticOwnerId,
    entityId: input.entity.id,
    semantic: input.semantic,
    geometry: Object.freeze({
      localBounds: local,
      ownerLocalBounds: Object.freeze([
        input.semantic.ownerLocalBounds.x,
        input.semantic.ownerLocalBounds.y,
        input.semantic.ownerLocalBounds.width,
        input.semantic.ownerLocalBounds.height,
      ] as const),
      worldBounds: world,
      hitBounds: world,
      visibleBounds: visible ? world : null,
    }),
    state: Object.freeze({
      visible,
      interactive: input.entity.interactive ?? true,
      zIndex: input.entity.zIndex ?? 0,
      opacity: input.entity.opacity ?? 1,
    }),
    transform: Object.freeze({
      affine: input.projection.affine,
      worldBasis: input.projection.worldBasis,
      visibleCenter: input.projection.visibleCenter,
      rotationDegrees: input.projection.rotationDegrees,
      scaleX: input.projection.scaleX,
      scaleY: input.projection.scaleY,
      contentOrientation: input.projection.contentOrientation,
    }),
    renderer: Object.freeze({
      plannedRoute: visible && renderer.attachedRoute !== 'none'
        ? renderer.attachedRoute
        : input.semantic.rendererRoute,
      attachedRoute: visible ? renderer.attachedRoute : null,
      objectKind: visible ? renderer.objectKind : 'none',
      routeDecisionReason: visible ? renderer.routeDecisionReason : 'not-attached',
      objectCount: visible ? renderer.objectCount : 0,
      semanticSignatures: signatures,
      attachedSignatures: visible ? renderer.attachedSignatures : null,
      lastRenderedSignatures: visible ? renderer.lastRenderedSignatures : null,
      lastRenderedFrame: visible ? renderer.lastRenderedFrame : null,
      staleGlyphCount: 0,
    }),
    rendererPaint: visible ? paint : null,
    renderLanes: current ? laneSnapshot(1) : null,
    publication: Object.freeze({
      status: absent ? 'absent' : current ? 'current' : 'pending',
      sceneRevision: input.surfaceSceneRevision,
      renderedSceneRevision: input.renderedSceneRevision,
      rendererFrame: current ? input.frame : null,
    }),
  });
}

function addSurfaceProbe(
  probes: Map<string, PatchMapTextProductProbe | null>,
  target: PatchMapTextTarget,
  probe: PatchMapTextProductProbe,
): void {
  const key = textTargetKey(target);
  const previous = probes.get(key);
  probes.set(key, previous === undefined || previous?.entityId === probe.entityId ? probe : null);
}

async function createEngine(
  engines: PatchMap[],
  surface: PatchMapEngineSurface,
  instanceId: string,
): Promise<PatchMap> {
  const engine = new PatchMap({ surfaceFactory: () => Promise.resolve(surface) });
  engines.push(engine);
  await engine.initialize({ instanceId, width: 320, height: 240 });
  return engine;
}

function directTextDataset(source: string, show = true): readonly Record<string, unknown>[] {
  return [{
    type: 'text',
    id: 'text',
    text: source,
    show,
    style: { fontFamily: 'Unifont', fontSize: 16, lineHeight: 20, fill: '#224466ff' },
  }];
}

function itemTextDataset(): readonly Record<string, unknown>[] {
  return [{
    type: 'item',
    id: 'item-a',
    size: { width: 120, height: 80 },
    contentOrientation: 'upright',
    components: [{
      type: 'text',
      id: 'label',
      text: 'item label',
      placement: 'right-bottom',
      margin: 2,
      style: { fontFamily: 'Unifont', fontSize: 16, lineHeight: 20 },
    }],
  }];
}

function gridTextDataset(): readonly Record<string, unknown>[] {
  return [{
    type: 'grid',
    id: 'grid-a',
    cells: [[1, 1]],
    item: {
      size: { width: 80, height: 40 },
      components: [{
        type: 'text',
        id: 'label',
        text: 'grid label',
        placement: 'center',
        style: { fontFamily: 'Unifont', fontSize: 16, lineHeight: 20 },
      }],
    },
  }];
}

function elementTarget(): PatchMapTextTarget {
  return { kind: 'element', id: 'text' };
}

function componentTarget(ownerId: string, id: string): PatchMapTextTarget {
  return { kind: 'component', ownerId, id };
}

function textTargetKey(target: PatchMapTextTarget): string {
  return target.kind === 'element'
    ? `element:${target.id.length}:${target.id}`
    : `component:${target.ownerId.length}:${target.ownerId}:${target.id.length}:${target.id}`;
}

function laneSnapshot(textCount: number): PatchMapRenderLaneSnapshot {
  const lane = (role: PatchMapRenderLaneRole) => Object.freeze({
    role,
    label: `indexed:${role}`,
    renderObjectCount: role === 'text' && textCount > 0 ? 1 : 0,
    visiblePrimitiveCount: role === 'text' ? textCount : 0,
  });
  return Object.freeze({
    'background-geometry': lane('background-geometry'),
    'background-assets': lane('background-assets'),
    'ordinary-geometry': lane('ordinary-geometry'),
    'relations-dynamic': lane('relations-dynamic'),
    'content-assets': lane('content-assets'),
    text: lane('text'),
    'interaction-overlay': lane('interaction-overlay'),
  });
}
