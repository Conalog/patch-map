import type { ParsePatchMapResult } from '../contracts';
import type { PatchMapRendererStrategy } from './types';

const RETIRED_MESH_DEGRADATION_CODES = new Set([
  'mesh-radius-degraded',
  'mesh-stroke-unsupported',
]);

/**
 * Renderer fidelity facts no longer need a side cache: Mesh delegates styled
 * rectangles and rounded bars to aggregate GraphicsContext lanes.
 */
export function inheritRendererDegradationDiagnostics(
  _source: ParsePatchMapResult,
  _target: ParsePatchMapResult,
): void {}

/** Incremental geometry edits cannot reintroduce a retired degradation. */
export function inheritRendererDegradationDiagnosticsIncremental(
  _source: ParsePatchMapResult,
  _target: ParsePatchMapResult,
  _entityIds: readonly string[],
): boolean {
  return true;
}

/**
 * Remove renderer warnings emitted by an older shell while preserving parser
 * diagnostics and immutable document identity.
 */
export function withRendererDegradationDiagnostics(
  parse: ParsePatchMapResult,
  strategy: PatchMapRendererStrategy,
): ParsePatchMapResult {
  if (strategy !== 'mesh') return parse;
  const retained = parse.diagnostics.filter(
    ({ code }) => !RETIRED_MESH_DEGRADATION_CODES.has(code),
  );
  if (retained.length === parse.diagnostics.length) return parse;
  return Object.freeze({
    ...parse,
    diagnostics: Object.freeze(retained),
  });
}
