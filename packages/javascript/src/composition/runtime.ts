import {
  PatchMapRuntime,
  type PatchMapRuntimeOptions,
} from '../core';
import type { PatchMapRuntimeRendererBackend } from '../core/runtime-renderer-port';
import { PatchMapPixiRenderer } from '../rendering/pixi-renderer';
import type { PatchMapPixiRendererOptions } from '../rendering/contracts/options';

export type PatchMapRuntimeCreationOptions = PatchMapRuntimeOptions &
  PatchMapPixiRendererOptions;

export interface PatchMapPixiRuntimeAssembly {
  readonly runtime: PatchMapRuntime;
  readonly renderer: PatchMapPixiRenderer;
}

/** Compose the neutral Core runtime with the production Pixi renderer. */
export async function createPatchMapRuntime(
  options: PatchMapRuntimeCreationOptions = {},
): Promise<PatchMapRuntime> {
  return (await createPatchMapPixiRuntimeAssembly(options)).runtime;
}

/** Concrete assembly retained by the Pixi-backed Engine surface. */
export async function createPatchMapPixiRuntimeAssembly(
  options: PatchMapRuntimeCreationOptions = {},
): Promise<PatchMapPixiRuntimeAssembly> {
  const renderer = await PatchMapPixiRenderer.create(options);
  try {
    const runtime = PatchMapRuntime.attach(
      renderer as unknown as PatchMapRuntimeRendererBackend,
      options,
    );
    return Object.freeze({ runtime, renderer });
  } catch (error) {
    renderer.destroy();
    await renderer.whenDestroyed();
    throw error;
  }
}
