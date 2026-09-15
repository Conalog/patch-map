import { PatchMap } from '../../src/engine';
import type { PatchMapEngineOptions } from '../../src/engine/contracts/product';
import { createPatchMapApi } from '../../src/public';

/** Test-only composition for scenarios that exercise the public API over an injected Engine surface. */
export function createPublicApiEngine(options: PatchMapEngineOptions = {}) {
  const engine = new PatchMap(options);
  return Object.assign(engine, createPatchMapApi(engine));
}
