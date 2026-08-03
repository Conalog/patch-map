/**
 * Public `@conalog/patch-map` entry.
 *
 * The package intentionally exposes one PixiJS product surface. Historical
 * performance controls and experiment subpaths are not part of the release.
 */
import { PatchMap as PatchMapImplementation } from './patch-map/engine';
import type {
  PatchMapConstructor,
  PatchMapPublic,
} from './patch-map/developer-api';

/** Preferred high-level entry. Runtime-identical to the advanced Engine. */
export const PatchMap: PatchMapConstructor = PatchMapImplementation;
export type PatchMap = PatchMapPublic;

export * from './patch-map/index';
export type * from './patch-map/input';
