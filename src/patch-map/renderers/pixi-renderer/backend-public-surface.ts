import { VERSION, type Application, type Container } from 'pixi.js';

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
  application: Application,
  canvas: HTMLCanvasElement,
  world: Container,
  target: HTMLElement | undefined,
  lastLaneProbe: PatchMapRenderLaneSnapshot,
): PatchMapPixiPublicSurfaceProbe {
  const stage = application.stage;
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
    backend: activeRendererBackend(application),
    applicationInitialized: application.renderer !== undefined,
    manualRender: true,
    canvas: Object.freeze({
      authoritative: application.canvas === canvas,
      attached: target?.contains(canvas) ?? canvas.isConnected,
      patchMapProduct: canvas.dataset.patchMapProduct === 'patch-map'
        ? 'patch-map'
        : null,
    }),
    stage: Object.freeze({
      label: stage.label,
      authoritative: stage.children.includes(world) && world.parent === stage,
      discoverableByDevTools: pixiDevtoolsOwnsApplication(application),
      worldAttached: stage.children.includes(world) && world.parent === stage,
      childCount: stage.children.length,
    }),
    aggregateLayers: Object.freeze(roles.map((role) => {
      const lane = lastLaneProbe[role];
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
  application: Application,
  activeBackendValue: PatchMapActiveRendererBackend,
  initialWebGLVersion: 1 | 2 | null,
  destroyed: boolean,
  rendererLossState: PatchMapRendererLossState,
  rendererLossEventCount: number,
  rendererRestorationEventCount: number,
  recoveredRendererFrameCount: number,
  contextLossUnbind: (() => void) | null,
  lastRendererLossFrame: number | null,
  lastRendererRecoveryFrame: number | null,
): PatchMapPixiRendererLossProbe {
  if (destroyed) {
    return Object.freeze({
      backend: activeBackendValue,
      webGLVersion: initialWebGLVersion,
      state: 'destroyed',
      contextLost: false,
      lossEventCount: rendererLossEventCount,
      restorationEventCount: rendererRestorationEventCount,
      recoveredFrameCount: recoveredRendererFrameCount,
      listenerCount: 0,
      lastLossFrame: lastRendererLossFrame,
      lastRecoveryFrame: lastRendererRecoveryFrame,
      destroyed: true,
    });
  }
  const context = publicGlContext(application);
  const contextLost = context?.isLost === true;
  return Object.freeze({
    backend: activeBackendValue,
    webGLVersion: context?.webGLVersion ?? initialWebGLVersion,
    state: contextLost ? 'lost' : rendererLossState,
    contextLost,
    lossEventCount: rendererLossEventCount,
    restorationEventCount: rendererRestorationEventCount,
    recoveredFrameCount: recoveredRendererFrameCount,
    listenerCount: contextLossUnbind === null ? 0 : 2,
    lastLossFrame: lastRendererLossFrame,
    lastRecoveryFrame: lastRendererRecoveryFrame,
    destroyed: false,
  });
}

function publicRenderer(application: Application): PixiPublicRendererSurface {
  return application.renderer as unknown as PixiPublicRendererSurface;
}
