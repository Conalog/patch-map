import productionShapedWorkloadJson from '../../fixtures/production-shaped.json';
import { PatchMapDatasetError } from '../../../src/semantic/dataset/contracts';
import { createPatchMapSemanticProbe } from '../../../src/semantic/probe';
import {
  materializePatchMapDataset,
  validatePatchMapDatasetReferences,
} from '../../../src/semantic/dataset';
import { buildPatchMapSeededScene } from '../../fixtures/seeded-scene';

import { deepFreeze, sortJson } from './semantics';

export const PATCH_MAP_BENCHMARK_SEED = 319;
export const PATCH_MAP_BENCHMARK_SIZES = Object.freeze([
  100,
  500,
  1_000,
  2_000,
  5_000,
  'production-shaped-workload-v1',
] as const);

export type PatchMapBenchmarkSize =
  (typeof PATCH_MAP_BENCHMARK_SIZES)[number];

export function buildPatchMapBenchmarkDataset(
  size: PatchMapBenchmarkSize,
  seed = PATCH_MAP_BENCHMARK_SEED,
  actionIndex = 0,
): readonly Readonly<Record<string, unknown>>[] {
  const dataset = size === 'production-shaped-workload-v1'
    ? structuredClone(productionShapedWorkloadJson)
    : structuredClone(buildPatchMapSeededScene(size, seed, actionIndex));
  return deepFreeze(dataset) as readonly Readonly<Record<string, unknown>>[];
}
export async function canonicalPatchMapDatasetSha256(input: unknown): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(sortJson(input))),
  );
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

export function validatePatchMapBenchmarkDataset(
  input: unknown,
): Readonly<{
  semanticHash: string;
  rootCount: number;
  elementCount: number;
  componentCount: number;
  strictReferenceDiagnostics: readonly Readonly<{
    code: string;
    datasetPath: string;
  }>[];
}> {
  const materialized = materializePatchMapDataset(input);
  const strictReferenceDiagnostics: Array<Readonly<{
    code: string;
    datasetPath: string;
  }>> = [];
  try {
    validatePatchMapDatasetReferences(materialized.dataset);
  } catch (error) {
    if (!(error instanceof PatchMapDatasetError) || error.code !== 'MISSING_TARGET') throw error;
    strictReferenceDiagnostics.push(Object.freeze({
      code: error.code,
      datasetPath: error.datasetPath,
    }));
  }
  const semantic = createPatchMapSemanticProbe(materialized, {
    lifecycle: materialized.rootIds.length === 0 ? 'ready-empty' : 'scene-ready',
  });
  return Object.freeze({
    semanticHash: materialized.semanticHash,
    rootCount: materialized.rootIds.length,
    elementCount: semantic.scene.counts.elements,
    componentCount: semantic.scene.counts.components,
    strictReferenceDiagnostics: Object.freeze(strictReferenceDiagnostics),
  });
}
