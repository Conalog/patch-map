import { VERSION, type Application, type Container } from 'pixi.js';

import type { PatchMapPixiRenderer } from '../pixi-renderer';
import { pixiDevtoolsOwnsApplication } from '../pixi-devtools-registration';
import type {
  PatchMapActiveRendererBackend,
  PatchMapPixiPublicSurfaceProbe,
  PatchMapPixiRendererLossProbe,
  PatchMapRendererLossState,
  PatchMapRenderLaneSnapshot,
  PatchMapRenderLaneRole,
} from '../types';

export interface PixiPublicGlContextSystem {
  readonly webGLVersion?: 1 | 2;
  readonly isLost?: boolean;
  forceContextLoss?(): void;
}

interface PixiPublicRendererSurface {
  readonly name?: string;
  readonly context?: PixiPublicGlContextSystem;
}

interface PatchMapPixiPublicSurfaceState {
  readonly application: Application;
  readonly canvas: HTMLCanvasElement;
  readonly world: Container;
  readonly target: HTMLElement | undefined;
  readonly lastLaneProbe: PatchMapRenderLaneSnapshot;
}

interface PatchMapPixiRendererLossStateView {
  readonly application: Application;
  readonly activeBackend: PatchMapActiveRendererBackend;
  readonly initialWebGLVersion: 1 | 2 | null;
  readonly destroyedValue: boolean;
  readonly rendererLossState: PatchMapRendererLossState;
  readonly rendererLossEventCount: number;
  readonly rendererRestorationEventCount: number;
  readonly recoveredRendererFrameCount: number;
  readonly contextLossUnbind: (() => void) | null;
  readonly lastRendererLossFrame: number | null;
  readonly lastRendererRecoveryFrame: number | null;
}

export function publicGlContext(application: Application): PixiPublicGlContextSystem | null {
  return publicRenderer(application).context ?? null;
}

export function activeRendererBackend(
  application: Application,
): PatchMapActiveRendererBackend {
  const renderer = publicRenderer(application);
  const name = renderer.name ?? application.renderer.constructor.name;
  if (/webgpu/i.test(name)) return 'webgpu';
  if (/webgl|glrenderer/i.test(name)) {
    const version = renderer.context?.webGLVersion;
    return version === 2 ? 'webgl2' : version === 1 ? 'webgl1' : 'unknown';
  }
  return 'unknown';
}

export function backendName(application: Application): string {
  const name = publicRenderer(application).name ?? application.renderer.constructor.name;
  if (/webgpu/i.test(name)) return 'webgpu';
  if (/webgl|glrenderer/i.test(name)) return 'webgl';
  return name || 'unknown';
}

export function readPatchMapPixiPublicSurfaceProbe(
  renderer: PatchMapPixiRenderer,
): PatchMapPixiPublicSurfaceProbe {
  const state = renderer as unknown as PatchMapPixiPublicSurfaceState;
  const stage = state.application.stage;
  const roles: readonly PatchMapRenderLaneRole[] = [
    'background-geometry',
    'background-assets',
    'ordinary-geometry',
    'relations-dynamic',
    'content-assets',
    'text',
    'interaction-overlay',
  ];
  return Object.freeze({
    rendererLibrary: 'pixi.js-v8',
    rendererVersion: VERSION,
    backend: activeRendererBackend(state.application),
    applicationInitialized: state.application.renderer !== undefined,
    manualRender: true,
    canvas: Object.freeze({
      authoritative: state.application.canvas === state.canvas,
      attached: state.target?.contains(state.canvas) ?? state.canvas.isConnected,
      patchMapProduct: state.canvas.dataset.patchMapProduct === 'patch-map'
        ? 'patch-map'
        : null,
    }),
    stage: Object.freeze({
      label: stage.label,
      authoritative: stage.children.includes(state.world) && state.world.parent === stage,
      discoverableByDevTools: pixiDevtoolsOwnsApplication(state.application),
      worldAttached: stage.children.includes(state.world) && state.world.parent === stage,
      childCount: stage.children.length,
    }),
    aggregateLayers: Object.freeze(roles.map((role) => {
      const lane = state.lastLaneProbe[role];
      return Object.freeze({
        role,
        label: lane.label,
        renderObjectCount: lane.renderObjectCount,
        visiblePrimitiveCount: lane.visiblePrimitiveCount,
      });
    })),
  });
}

export function readPatchMapPixiRendererLossProbe(
  renderer: PatchMapPixiRenderer,
): PatchMapPixiRendererLossProbe {
  const state = renderer as unknown as PatchMapPixiRendererLossStateView;
  if (state.destroyedValue) {
    return Object.freeze({
      backend: state.activeBackend,
      webGLVersion: state.initialWebGLVersion,
      state: 'destroyed',
      contextLost: false,
      lossEventCount: state.rendererLossEventCount,
      restorationEventCount: state.rendererRestorationEventCount,
      recoveredFrameCount: state.recoveredRendererFrameCount,
      listenerCount: 0,
      lastLossFrame: state.lastRendererLossFrame,
      lastRecoveryFrame: state.lastRendererRecoveryFrame,
      destroyed: true,
    });
  }
  const context = publicGlContext(state.application);
  const contextLost = context?.isLost === true;
  return Object.freeze({
    backend: state.activeBackend,
    webGLVersion: context?.webGLVersion ?? state.initialWebGLVersion,
    state: contextLost ? 'lost' : state.rendererLossState,
    contextLost,
    lossEventCount: state.rendererLossEventCount,
    restorationEventCount: state.rendererRestorationEventCount,
    recoveredFrameCount: state.recoveredRendererFrameCount,
    listenerCount: state.contextLossUnbind === null ? 0 : 2,
    lastLossFrame: state.lastRendererLossFrame,
    lastRecoveryFrame: state.lastRendererRecoveryFrame,
    destroyed: false,
  });
}

function publicRenderer(application: Application): PixiPublicRendererSurface {
  return application.renderer as unknown as PixiPublicRendererSurface;
}
