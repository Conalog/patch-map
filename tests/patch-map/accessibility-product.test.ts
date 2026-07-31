import { describe, expect, it, vi } from 'vitest';

import {
  PATCH_MAP_ACCESSIBILITY_REVISION,
  PatchMapAccessibilityAuthority,
  PatchMap,
  PatchMapLogicalSceneIndex,
  derivePatchMapAccessibilityTargets,
  materializePatchMapDataset,
  type PatchMapAccessibilityActivationInput,
  type PatchMapAccessibilityRenderNode,
  type PatchMapAccessibilitySurfaceProbe,
  type PatchMapAccessibilityTargetInput,
  type PatchMapEngineSurface,
  type PatchMapSurfaceDebug,
  type PatchMapSurfaceEntityGeometry,
  type PatchMapSurfaceReconcileOptions,
  type PatchMapSurfaceReconcileResult,
  type PatchMapSurfaceView,
} from '../../src/patch-map';
import { PatchMapPixiRenderer } from '../../src/patch-map/renderers/pixi-renderer';

describe('PatchMap accessibility product authority', () => {
  it('probes an inactive Pixi accessibility system without dereferencing its released DOM root', () => {
    class TestHTMLElement {}
    vi.stubGlobal('HTMLElement', TestHTMLElement);
    vi.stubGlobal('document', {
      activeElement: new TestHTMLElement(),
    });
    try {
      const probe = PatchMapPixiRenderer.prototype.accessibilitySurfaceProbe.call({
        destroyedValue: false,
        application: {
          renderer: {
            accessibility: {
              isActive: false,
              div: null,
            },
          },
        },
        accessibilityRoot: null,
        accessibilityNodes: new Map(),
        accessibilityClickListener: null,
        accessibilityFocusedId: null,
      } as unknown as PatchMapPixiRenderer);

      expect(probe).toMatchObject({
        active: false,
        shadowDomActive: false,
        shadowDomNodeCount: 0,
        destroyed: false,
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('derives stable focus order and owner-aggregate bounds without Pixi identities', () => {
    const materialized = materializePatchMapDataset(interactiveScene());
    const logical = new PatchMapLogicalSceneIndex(materialized.dataset);
    const derived = derivePatchMapAccessibilityTargets(
      logical.targets(),
      geometryEntities(),
    );

    expect(derived.targets.map(({ id }) => id)).toEqual([
      'item-a',
      'rect-b',
      'text-c',
    ]);
    expect(derived.targets[0]).toMatchObject({
      id: 'item-a',
      label: 'Item A',
      screenBounds: [10, 20, 100, 80],
      actions: ['focus', 'activate', 'select'],
    });
    expect(derived).toMatchObject({
      hiddenFocusableCount: 0,
      invalidNodeCount: 0,
      nonFiniteBoundsCount: 0,
    });
  });

  it('filters hidden targets and rejects non-finite geometry without losing locked focus', () => {
    const materialized = materializePatchMapDataset(interactiveScene());
    const logical = new PatchMapLogicalSceneIndex(materialized.dataset);
    const targets = logical.targets().map((target) => {
      if (target.id === 'item-a') {
        return Object.freeze({ ...target, locked: true });
      }
      if (target.id === 'rect-b') {
        return Object.freeze({
          ...target,
          value: Object.freeze({ ...target.value, show: false }),
        });
      }
      return target;
    });
    const geometries = geometryEntities().map((entity) =>
      entity.id === 'text-c'
        ? Object.freeze({
            ...entity,
            screenBounds: Object.freeze([
              Number.NaN,
              140,
              80,
              20,
            ] as const),
          })
        : entity);

    expect(derivePatchMapAccessibilityTargets(targets, geometries)).toEqual({
      targets: [{
        id: 'item-a',
        label: 'Item A',
        type: 'item',
        screenBounds: [10, 20, 100, 80],
        sceneOrder: 0,
        locked: true,
        actions: ['focus'],
      }],
      hiddenFocusableCount: 1,
      invalidNodeCount: 1,
      nonFiniteBoundsCount: 1,
    });
  });

  it('deduplicates Pixi aliases while preserving logical focus and selection intent', () => {
    const authority = new PatchMapAccessibilityAuthority();
    authority.reconcile({
      targets: [{
        id: 'item-a',
        label: 'Item A',
        type: 'item',
        screenBounds: [10, 20, 100, 80],
        sceneOrder: 0,
        locked: false,
        actions: ['focus', 'activate', 'select'],
      }],
      hiddenFocusableCount: 0,
      invalidNodeCount: 0,
      nonFiniteBoundsCount: 0,
    });

    expect(authority.activate('item-a', {
      source: 'Enter',
      activationId: 'physical-1',
    })).toMatchObject({
      activated: true,
      selectRequested: true,
      duplicateSuppressed: false,
    });
    expect(authority.activate('item-a', {
      source: 'pixi-click-alias',
      activationId: 'physical-1',
    })).toMatchObject({
      activated: false,
      selectRequested: false,
      duplicateSuppressed: true,
    });
    expect(authority.probe(['item-a'])).toMatchObject({
      schemaRevision: PATCH_MAP_ACCESSIBILITY_REVISION,
      duplicateActivationCount: 0,
      suppressedAliasCount: 1,
      focusedId: 'item-a',
      targets: {
        'item-a': {
          role: 'button',
          name: 'Item A',
          description: null,
          disabled: false,
          focused: true,
          focusVisible: true,
          selected: true,
          actions: ['focus', 'activate', 'select'],
          supportedActions: ['focus', 'activate', 'select'],
          performedActions: ['focus', 'activate', 'select'],
          children: [],
        },
      },
      children: ['item-a'],
    });
  });

  it('clears removed focus and performed actions while retaining supported actions', () => {
    const authority = new PatchMapAccessibilityAuthority();
    authority.reconcile({
      targets: [
        {
          id: 'item-a',
          label: 'Item A',
          type: 'item',
          screenBounds: [10, 20, 100, 80],
          sceneOrder: 0,
          locked: false,
          actions: ['focus', 'activate', 'select'],
        },
        {
          id: 'rect-b',
          label: 'Rect B',
          type: 'rect',
          screenBounds: [160, 40, 40, 30],
          sceneOrder: 1,
          locked: false,
          actions: ['focus', 'activate', 'select'],
        },
      ],
      hiddenFocusableCount: 0,
      invalidNodeCount: 0,
      nonFiniteBoundsCount: 0,
    });
    authority.activate('item-a', {
      source: 'Enter',
      activationId: 'removed-target-activation',
    });

    authority.reconcile({
      targets: [{
        id: 'rect-b',
        label: 'Rect B',
        type: 'rect',
        screenBounds: [160, 40, 40, 30],
        sceneOrder: 1,
        locked: false,
        actions: ['focus', 'activate', 'select'],
      }],
      hiddenFocusableCount: 0,
      invalidNodeCount: 0,
      nonFiniteBoundsCount: 0,
    });

    expect(authority.probe([])).toMatchObject({
      orderedIds: ['rect-b'],
      focusedId: null,
      targets: {
        'rect-b': {
          actions: ['focus', 'activate', 'select'],
          performedActions: [],
        },
      },
    });
    expect(authority.probe([]).targets['item-a']).toBeUndefined();
  });

  it('keeps reconcile authority state atomic when count validation or target freezing fails', () => {
    const authority = new PatchMapAccessibilityAuthority();
    const retainedTarget: PatchMapAccessibilityTargetInput = {
      id: 'item-a',
      label: 'Item A',
      type: 'item',
      screenBounds: [10, 20, 100, 80],
      sceneOrder: 0,
      locked: false,
      actions: ['focus', 'activate', 'select'],
    };
    authority.reconcile({
      targets: [retainedTarget],
      hiddenFocusableCount: 2,
      invalidNodeCount: 3,
      nonFiniteBoundsCount: 1,
    });
    authority.activate('item-a', {
      source: 'Enter',
      activationId: 'atomic-activation',
    });
    authority.activate('item-a', {
      source: 'pixi-click-alias',
      activationId: 'atomic-activation',
    });
    const before = authority.probe(['item-a']);

    expect(() => authority.reconcile({
      targets: [{
        id: 'rect-b',
        label: 'Rect B',
        type: 'rect',
        screenBounds: [160, 40, 40, 30],
        sceneOrder: 1,
        locked: false,
        actions: ['focus', 'activate', 'select'],
      }],
      hiddenFocusableCount: 9,
      invalidNodeCount: -1,
      nonFiniteBoundsCount: 7,
    })).toThrow('invalidNodeCount must be a non-negative safe integer');
    expect(authority.enabled).toBe(true);
    expect(authority.probe(['item-a'])).toEqual(before);

    const throwingTarget: PatchMapAccessibilityTargetInput = {
      id: 'throws',
      label: 'Throws',
      type: 'rect',
      screenBounds: [0, 0, 1, 1],
      sceneOrder: 2,
      locked: false,
      get actions(): PatchMapAccessibilityTargetInput['actions'] {
        throw new Error('target freeze failed');
      },
    };
    expect(() => authority.reconcile({
      targets: [retainedTarget, throwingTarget],
      hiddenFocusableCount: 0,
      invalidNodeCount: 0,
      nonFiniteBoundsCount: 0,
    })).toThrow('target freeze failed');
    expect(authority.enabled).toBe(true);
    expect(authority.probe(['item-a'])).toEqual(before);
  });
});

describe('PatchMap Engine accessibility integration', () => {
  it('connects logical tree, root activation, reduced motion, and cleanup', async () => {
    const surface = new AccessibilitySurface();
    const engine = new PatchMap({
      surfaceFactory: () => Promise.resolve(surface),
    });
    await engine.initialize({
      instanceId: 'accessibility-test',
      width: 800,
      height: 600,
      pixelRatio: 1,
      backend: 'webgl2',
    });
    engine.loadDataset(interactiveScene());
    engine.publishFrame(0);

    expect(engine.accessibilityTree()).toMatchObject({
      orderedIds: ['item-a', 'rect-b', 'text-c'],
      surface: {
        active: true,
        overlayNodeCount: 3,
        rootListenerCount: 1,
        entityListenerCount: 0,
      },
    });
    expect(engine.focusAccessibilityTarget('item-a').targets['item-a'])
      .toMatchObject({ focused: true, focusVisible: true });
    surface.activate('item-a', {
      source: 'pixi-click-alias',
      activationId: 'surface-1',
    });
    expect(engine.snapshot().selectionIds).toEqual(['item-a']);
    expect(engine.accessibilityProbe().targets['item-a']?.actions)
      .toEqual(['focus', 'activate', 'select']);

    expect(engine.setReducedMotion(true)).toEqual({
      changed: true,
      enabled: true,
      activeAnimationCount: 0,
    });
    const patch = engine.patch(
      { kind: 'component', ownerId: 'item-a', id: 'bar' },
      { size: { width: 60, height: 45 } },
    );
    expect(patch.status).toBe('committed');
    expect(surface.lastReconcileOptions).toMatchObject({
      animateBarChanges: false,
    });

    engine.loadDataset([]);
    engine.publishFrame(1);
    expect(engine.accessibilityProbe().surface).toMatchObject({
      active: false,
      overlayNodeCount: 0,
      rootListenerCount: 0,
    });

    await engine.destroy();
    expect(engine.accessibilityProbe()).toMatchObject({
      orderedIds: [],
      destroyed: true,
      surface: null,
    });
    expect(surface.activationListener).toBeNull();
    expect(surface.canvasCount).toBe(0);
  });
});

class AccessibilitySurface implements PatchMapEngineSurface {
  public canvasCount = 1;
  public destroyed = false;
  public activationListener:
    | ((
        targetId: string,
        input: PatchMapAccessibilityActivationInput,
      ) => void)
    | null = null;
  public lastReconcileOptions: PatchMapSurfaceReconcileOptions = {};
  private nodes: readonly PatchMapAccessibilityRenderNode[] = [];
  private selectedIds: readonly string[] = [];
  private focusedId: string | null = null;
  private reducedMotion = false;

  public load(): void {}

  public reconcile(
    _input: unknown,
    options: PatchMapSurfaceReconcileOptions = {},
  ): PatchMapSurfaceReconcileResult {
    this.lastReconcileOptions = Object.freeze({ ...options });
    return Object.freeze({
      status: 'committed',
      operationCount: 1,
      denseChanged: true,
      diagnostics: Object.freeze([]),
    });
  }

  public publishFrame(): void {}

  public resize(): boolean {
    return false;
  }

  public setView(_view: PatchMapSurfaceView): void {}

  public bindAccessibilityActivation(
    listener: (
      targetId: string,
      input: PatchMapAccessibilityActivationInput,
    ) => void,
  ): () => void {
    this.activationListener = listener;
    return () => {
      if (this.activationListener === listener) this.activationListener = null;
    };
  }

  public setAccessibilityTree(
    nodes: readonly PatchMapAccessibilityRenderNode[],
  ): PatchMapAccessibilitySurfaceProbe {
    this.nodes = Object.freeze([...nodes]);
    return this.accessibilitySurfaceProbe();
  }

  public focusAccessibilityTarget(targetId: string): boolean {
    if (!this.nodes.some(({ id }) => id === targetId)) return false;
    this.focusedId = targetId;
    return true;
  }

  public accessibilitySurfaceProbe(): PatchMapAccessibilitySurfaceProbe {
    return Object.freeze({
      active: this.nodes.length > 0,
      shadowDomActive: this.nodes.length > 0,
      overlayNodeCount: this.nodes.length,
      shadowDomNodeCount: this.nodes.length,
      rootListenerCount:
        this.nodes.length > 0 && this.activationListener !== null ? 1 : 0,
      entityListenerCount: 0,
      focusedId: this.focusedId,
      shadowDomFocusedId: this.focusedId,
      destroyed: this.destroyed,
    });
  }

  public setReducedMotion(enabled: boolean): boolean {
    const changed = enabled !== this.reducedMotion;
    this.reducedMotion = enabled;
    return changed;
  }

  public select(ids: readonly string[]): void {
    this.selectedIds = Object.freeze([...ids]);
  }

  public hitTestScreen(): string | null {
    return null;
  }

  public screenToWorld(point: Readonly<{ x: number; y: number }>): {
    readonly x: number;
    readonly y: number;
  } {
    return Object.freeze({ ...point });
  }

  public debugSnapshot(): PatchMapSurfaceDebug {
    return Object.freeze({
      cssSize: Object.freeze([800, 600] as const),
      backingSize: Object.freeze([800, 600] as const),
      selectionIds: this.selectedIds,
      activeAnimationCount: 0,
      activeGestureCount: 0,
      renderCommandCount: 1,
      visiblePrimitiveCount: 3,
    });
  }

  public geometrySnapshot() {
    return Object.freeze({
      revision: 1,
      sceneRevision: 1,
      entities: geometryEntities(),
      relations: Object.freeze([]),
      omittedRelations: Object.freeze([]),
      selectionOverlay: null,
    });
  }

  public activate(
    targetId: string,
    input: PatchMapAccessibilityActivationInput,
  ): void {
    this.activationListener?.(targetId, input);
  }

  public destroy(): Promise<boolean> {
    if (this.destroyed) return Promise.resolve(false);
    this.destroyed = true;
    this.canvasCount = 0;
    this.nodes = Object.freeze([]);
    this.focusedId = null;
    return Promise.resolve(true);
  }
}

function geometryEntities(): readonly PatchMapSurfaceEntityGeometry[] {
  return Object.freeze([
    geometry('item-a::background:bg', [10, 20, 100, 80], {
      ownerItemId: 'item-a',
      componentId: 'bg',
      componentType: 'background',
    }),
    geometry('rect-b', [160, 40, 40, 30]),
    geometry('text-c', [40, 140, 80, 20]),
  ]);
}

function geometry(
  id: string,
  screenBounds: readonly [number, number, number, number],
  ownership: Readonly<{
    readonly ownerItemId?: string;
    readonly componentId?: string;
    readonly componentType?: string;
  }> = {},
): PatchMapSurfaceEntityGeometry {
  return Object.freeze({
    id,
    kind: 'rect',
    worldBounds: screenBounds,
    screenBounds,
    visible: true,
    interactive: true,
    ...ownership,
  });
}

function interactiveScene(): readonly unknown[] {
  return [
    {
      type: 'item',
      id: 'item-a',
      label: 'Item A',
      size: { width: 100, height: 80 },
      padding: 4,
      components: [
        {
          type: 'background',
          id: 'bg',
          source: { type: 'rect', fill: '#336699' },
        },
        {
          type: 'bar',
          id: 'bar',
          source: { type: 'rect', fill: '#00aa66' },
          size: { width: 60, height: 10 },
          placement: 'bottom',
          animation: true,
          animationDuration: 200,
        },
      ],
      attrs: { x: 10, y: 20, zIndex: 1 },
    },
    {
      type: 'rect',
      id: 'rect-b',
      size: { width: 40, height: 30 },
      fill: '#ff8800',
      attrs: { x: 160, y: 40, zIndex: 2 },
    },
    {
      type: 'text',
      id: 'text-c',
      text: 'Bravo',
      style: { fontFamily: 'FiraCode', fontSize: 16, fill: '#222222' },
      size: { width: 80, height: 20 },
      attrs: { x: 40, y: 140 },
    },
    {
      type: 'relations',
      id: 'links',
      links: [{ source: 'item-a', target: 'rect-b' }],
      style: { color: '#222222', width: 2 },
    },
  ];
}
