import {
  PatchMap,
  type PatchMapEngineSurfaceFactory,
  type PatchMapInitializeOptions,
  type PatchMapInitializeResult,
  type PatchMapOptions,
} from '../../../src/patch-map/engine';

import { isPatchMapLabRecord as isRecord } from './runtime-values';

export class TargetedWebGLPatchMapEngine extends PatchMap {
  private readonly surfaceHost: HTMLElement | undefined;

  public constructor(
    surfaceHost: HTMLElement | undefined,
    surfaceFactory: PatchMapEngineSurfaceFactory | undefined,
    engineOptions: Readonly<PatchMapOptions> = {},
  ) {
    super({
      ...engineOptions,
      ...(surfaceFactory ? { surfaceFactory } : {}),
    });
    this.surfaceHost = surfaceHost;
  }

  public override initialize(options: PatchMapInitializeOptions): Promise<PatchMapInitializeResult> {
    return super.initialize({
      ...options,
      preference: 'webgl',
      ...(this.surfaceHost ? { target: this.surfaceHost } : {}),
    });
  }
}

export function surfaceHostForEngineRole(
  visibleHost: HTMLElement | undefined,
  factoryContext: unknown,
): HTMLElement | undefined {
  if (
    visibleHost === undefined
    || typeof document === 'undefined'
    || !isRecord(factoryContext)
    || typeof factoryContext.role !== 'string'
    || !factoryContext.role.startsWith('declared-failure:')
  ) {
    return visibleHost;
  }
  return document.createElement('div');
}

export function assertPatchMapExecutableSurfaceReleased(
  surfaceHost: HTMLElement | undefined,
): void {
  if (!surfaceHost || typeof surfaceHost.querySelector !== 'function') return;
  if (surfaceHost.querySelector('canvas[data-patch-map-product="patch-map"]') !== null) {
    throw new Error(
      'Invalid PatchMap executable Lab bridge: executor left a tracked PixiJS canvas in the Lab host',
    );
  }
}
