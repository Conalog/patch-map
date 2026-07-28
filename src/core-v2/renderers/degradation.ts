import type { ParseDiagnostic, ParsePatchMapResult } from '../contracts';
import type { CoreV2RendererStrategy } from './types';

const MESH_DEGRADATION_CODES = new Set([
  'mesh-radius-degraded',
  'mesh-stroke-unsupported',
]);
const MESH_DEGRADATION_CACHE = new WeakMap<
  ParsePatchMapResult,
  readonly ParseDiagnostic[]
>();

/** Reuse renderer-only facts when an incremental edit cannot change paint support. */
export function inheritRendererDegradationDiagnostics(
  source: ParsePatchMapResult,
  target: ParsePatchMapResult,
): void {
  if (source === target) return;
  const additions = MESH_DEGRADATION_CACHE.get(source);
  if (additions !== undefined) MESH_DEGRADATION_CACHE.set(target, additions);
}

/**
 * Attach renderer-specific fidelity warnings without changing the immutable
 * schema parser result or silently discarding retained style data.
 */
export function withRendererDegradationDiagnostics(
  parse: ParsePatchMapResult,
  strategy: CoreV2RendererStrategy,
): ParsePatchMapResult {
  if (strategy !== 'mesh') return parse;
  const cached = MESH_DEGRADATION_CACHE.get(parse);
  if (cached !== undefined) return attachMeshDegradationDiagnostics(parse, cached);

  let roundedCount = 0;
  let omittedStrokeCount = 0;
  for (const entity of parse.document.entities) {
    if ((entity.kind === 'rect' || entity.kind === 'bar') && (entity.radius ?? 0) > 0) {
      roundedCount += 1;
    }
    if (
      entity.kind === 'rect' &&
      (entity.strokeWidth ?? 0) > 0 &&
      entity.stroke !== undefined &&
      (entity.stroke & 0xff) > 0
    ) {
      omittedStrokeCount += 1;
    }
  }

  const additions: ParseDiagnostic[] = [];
  if (roundedCount > 0) {
    additions.push(Object.freeze({
      level: 'warning',
      code: 'mesh-radius-degraded',
      path: '$.renderer.mesh',
      message: `${roundedCount} retained rect/bar radius value(s) render as square corners in the selected Mesh strategy`,
    }));
  }
  if (omittedStrokeCount > 0) {
    additions.push(Object.freeze({
      level: 'warning',
      code: 'mesh-stroke-unsupported',
      path: '$.renderer.mesh',
      message: `${omittedStrokeCount} retained rect stroke value(s) are not rendered by the selected Mesh strategy`,
    }));
  }
  const frozenAdditions = Object.freeze(additions);
  MESH_DEGRADATION_CACHE.set(parse, frozenAdditions);
  return attachMeshDegradationDiagnostics(parse, frozenAdditions);
}

function attachMeshDegradationDiagnostics(
  parse: ParsePatchMapResult,
  additions: readonly ParseDiagnostic[],
): ParsePatchMapResult {
  const retained = parse.diagnostics.filter(
    ({ code }) => !MESH_DEGRADATION_CODES.has(code),
  );
  if (additions.length === 0 && retained.length === parse.diagnostics.length) {
    return parse;
  }
  const result = Object.freeze({
    ...parse,
    diagnostics: Object.freeze([...retained, ...additions]),
  });
  MESH_DEGRADATION_CACHE.set(result, additions);
  return result;
}
