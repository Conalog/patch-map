import { PATCH_MAP_BUILTIN_FONT_ASSETS } from '../assets/registration-normalization';
import { PatchMap } from '../engine';
import type { PatchMapEngineSurfaceFactory } from '../engine/contracts';
import { createPatchMapApi } from '../public';
import type {
  PatchMapApi,
  PatchMapInstance,
  PatchMapOptions,
  PatchMapViewportOptions,
  PatchMapViewportSnapshot,
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
    engine.registerAssets(instanceId);
    if (options.assets !== undefined) engine.registerAssets(instanceId, options.assets);
    await engine.initialize({
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
      requiredAssets: [...PATCH_MAP_BUILTIN_FONT_ASSETS],
    });
    if (options.data !== undefined) {
      api.data.replace(options.data, {
        fit: viewportOptions.initial === null
          ? options.fit === undefined ? { padding: 24 } : options.fit
          : false,
      });
      await engine.settleSceneImages();
    }
    if (viewportOptions.initial !== null) {
      engine.setViewportAbsolute(viewportOptions.initial);
    }
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

function normalizeViewportOptions(
  value: PatchMapViewportOptions | undefined,
): Readonly<{
  readonly wheel: Readonly<{ readonly activationModifier: 'none' | 'control' }>;
  readonly initial: PatchMapViewportSnapshot | null;
}> {
  if (value === undefined) {
    return Object.freeze({
      wheel: Object.freeze({ activationModifier: 'none' as const }),
      initial: null,
    });
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('viewport options must be an object');
  }
  const wheel = value.wheel;
  if (wheel !== undefined && (
    wheel === null || typeof wheel !== 'object' || Array.isArray(wheel)
  )) {
    throw new TypeError('viewport.wheel must be an object');
  }
  const activationModifier = wheel?.activationModifier ?? 'none';
  if (activationModifier !== 'none' && activationModifier !== 'control') {
    throw new TypeError('viewport.wheel.activationModifier must be none or control');
  }
  const initial = value.initial;
  if (initial !== undefined && (
    initial === null
    || typeof initial !== 'object'
    || Array.isArray(initial)
    || !Array.isArray(initial.centerWorld)
    || initial.centerWorld.length !== 2
    || !Number.isFinite(initial.centerWorld[0])
    || !Number.isFinite(initial.centerWorld[1])
    || !(initial.scale > 0)
    || !Number.isFinite(initial.scale)
  )) {
    throw new TypeError('viewport.initial requires finite centerWorld and positive scale');
  }
  return Object.freeze({
    wheel: Object.freeze({ activationModifier }),
    initial: initial === undefined
      ? null
      : Object.freeze({
          centerWorld: Object.freeze([...initial.centerWorld] as [number, number]),
          scale: initial.scale,
        }),
  });
}
