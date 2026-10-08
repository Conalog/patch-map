import { normalizeViewportOptions } from './viewport-options';
import { initializePatchMapSession } from './session-initialization';
import { PatchMap } from '../engine';
import type { PatchMapEngineSurfaceFactory } from '../engine/contracts';
import { createPatchMapApi } from '../public';
import type {
  PatchMapApi,
  PatchMapInstance,
  PatchMapOptions,
} from '../public/contracts';

let mountSequence = 0;

/** Browser composition root for one public PatchMap instance. */
export async function mountPatchMap(
  options: PatchMapOptions,
  surfaceFactory: PatchMapEngineSurfaceFactory,
): Promise<PatchMapInstance> {
  const viewportOptions = normalizeViewportOptions(options.viewport);
  const target = resolveMountContainer(options.container);
  const [width, height] = resolveMountSize(target, options.width, options.height);
  const instanceId = options.instanceId
    ?? (target.id.length > 0 ? target.id : `patch-map-${++mountSequence}`);
  const engine = new PatchMap({
    ...(options.historyLimit === undefined ? {} : { historyLimit: options.historyLimit }),
    ...(options.assetRuntime === undefined ? {} : { assetRuntime: options.assetRuntime }),
    ...(options.assetPolicy === undefined ? {} : { assetPolicy: options.assetPolicy }),
    surfaceFactory,
  });
  const api = createPatchMapApi(engine);
  try {
    engine.configurePointerPolicy(options.pointer);
    engine.configurePointerSelectionPolicy(options.selection);
    await initializePatchMapSession(engine, api, options, {
      instanceId,
      target,
      width,
      height,
      ...(options.theme === undefined ? {} : { theme: options.theme }),
      ...(options.pixelRatio === undefined ? {} : { pixelRatio: options.pixelRatio }),
      ...(options.antialias === undefined ? {} : { antialias: options.antialias }),
      ...(options.background === undefined ? {} : { background: options.background }),
      ...(options.zoomLimits === undefined ? {} : { zoomLimits: options.zoomLimits }),
      wheelActivationModifier: viewportOptions.wheel.activationModifier,
      strategy: 'mesh',
      preference: options.backend === 'webgpu' ? 'webgpu' : 'webgl',
      backend: options.backend === 'webgpu' ? 'webgpu' : 'webgl2',
      ...(options.devtools === undefined ? {} : { devtools: options.devtools }),
      ...(options.powerPreference === undefined
        ? {}
        : { powerPreference: options.powerPreference }),
    }, viewportOptions.initial);
    const frameLoop = engine.createFrameLoop();
    frameLoop.publishNow();
    if (options.resizeMode !== 'manual') {
      engine.observeMountSize(target, options.pixelRatio);
    }
    return publicInstance(engine, api);
  } catch (error) {
    await engine.destroy().catch(() => undefined);
    throw error;
  }
}

function resolveMountContainer(container: string | HTMLElement): HTMLElement {
  if (typeof container !== 'string') return container;
  const element = globalThis.document?.querySelector<HTMLElement>(container) ?? null;
  if (element === null) {
    throw new TypeError(
      `PatchMap.mount could not find container "${container}". `
      + 'Create the container element before mounting or pass the HTMLElement directly.',
    );
  }
  return element;
}

function resolveMountSize(
  target: HTMLElement,
  width: number | undefined,
  height: number | undefined,
): readonly [number, number] {
  const bounds = target.getBoundingClientRect();
  const resolvedWidth = width ?? (bounds.width || target.clientWidth);
  const resolvedHeight = height ?? (bounds.height || target.clientHeight);
  if (!(resolvedWidth > 0) || !(resolvedHeight > 0)) {
    throw new RangeError(
      'PatchMap.mount requires a visible host size. '
      + 'Give the host CSS width/height or pass width and height explicitly.',
    );
  }
  return Object.freeze([resolvedWidth, resolvedHeight] as const);
}

function publicInstance(engine: PatchMap, api: PatchMapApi): PatchMapInstance {
  return Object.freeze({
    ...api,
    get destroyed(): boolean { return engine.destroyed; },
    destroy: () => engine.destroy(),
  });
}
