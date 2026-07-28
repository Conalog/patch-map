import type { EntityInput } from '../../core-v1/contracts';
import type { ParseDiagnostic, ParsePatchMapResult } from '../contracts';
import type { CoreV2RendererStrategy } from './types';

const MESH_DEGRADATION_CODES = new Set([
  'mesh-radius-degraded',
  'mesh-stroke-unsupported',
]);
interface MeshDegradationCacheEntry {
  readonly additions: readonly ParseDiagnostic[];
  readonly roundedCount: number;
  readonly omittedStrokeCount: number;
  readonly entityIndexById: ReadonlyMap<string, number>;
}

const MESH_DEGRADATION_CACHE = new WeakMap<
  ParsePatchMapResult,
  MeshDegradationCacheEntry
>();

/** Reuse renderer-only facts when an incremental edit cannot change paint support. */
export function inheritRendererDegradationDiagnostics(
  source: ParsePatchMapResult,
  target: ParsePatchMapResult,
): void {
  if (source === target) return;
  const entry = MESH_DEGRADATION_CACHE.get(source);
  if (entry !== undefined) MESH_DEGRADATION_CACHE.set(target, entry);
}

/**
 * Geometry-only flat edits retain entity identity. Recompute renderer warning
 * counts from the handful of dirty rows instead of rescanning 20,000 aggregate
 * entities after every transformer completion.
 */
export function inheritRendererDegradationDiagnosticsIncremental(
  source: ParsePatchMapResult,
  target: ParsePatchMapResult,
  entityIds: readonly string[],
): boolean {
  if (source === target) return true;
  const current = MESH_DEGRADATION_CACHE.get(source);
  if (current === undefined) return false;
  let roundedCount = current.roundedCount;
  let omittedStrokeCount = current.omittedStrokeCount;
  for (const entityId of entityIds) {
    const index = current.entityIndexById.get(entityId);
    const before = index === undefined ? undefined : source.document.entities[index];
    const after = index === undefined ? undefined : target.document.entities[index];
    if (
      index === undefined ||
      before?.id !== entityId ||
      after?.id !== entityId
    ) {
      return false;
    }
    roundedCount += Number(hasRoundedMeshDegradation(after)) -
      Number(hasRoundedMeshDegradation(before));
    omittedStrokeCount += Number(hasOmittedMeshStroke(after)) -
      Number(hasOmittedMeshStroke(before));
  }
  const entry = Object.freeze({
    additions: meshDegradationDiagnostics(roundedCount, omittedStrokeCount),
    roundedCount,
    omittedStrokeCount,
    entityIndexById: current.entityIndexById,
  });
  MESH_DEGRADATION_CACHE.set(target, entry);
  return true;
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
  const entityIndexById = new Map<string, number>();
  for (let index = 0; index < parse.document.entities.length; index += 1) {
    const entity = parse.document.entities[index];
    if (entity === undefined) continue;
    entityIndexById.set(entity.id, index);
    if (hasRoundedMeshDegradation(entity)) roundedCount += 1;
    if (hasOmittedMeshStroke(entity)) omittedStrokeCount += 1;
  }
  const entry = Object.freeze({
    additions: meshDegradationDiagnostics(roundedCount, omittedStrokeCount),
    roundedCount,
    omittedStrokeCount,
    entityIndexById,
  });
  MESH_DEGRADATION_CACHE.set(parse, entry);
  return attachMeshDegradationDiagnostics(parse, entry);
}

function meshDegradationDiagnostics(
  roundedCount: number,
  omittedStrokeCount: number,
): readonly ParseDiagnostic[] {
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
  return Object.freeze(additions);
}

function attachMeshDegradationDiagnostics(
  parse: ParsePatchMapResult,
  entry: MeshDegradationCacheEntry,
): ParsePatchMapResult {
  const { additions } = entry;
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
  MESH_DEGRADATION_CACHE.set(result, entry);
  return result;
}

function hasRoundedMeshDegradation(entity: EntityInput): boolean {
  return (
    (entity.kind === 'rect' || entity.kind === 'bar') &&
    (entity.radius ?? 0) > 0
  );
}

function hasOmittedMeshStroke(entity: EntityInput): boolean {
  return (
    entity.kind === 'rect' &&
    (entity.strokeWidth ?? 0) > 0 &&
    entity.stroke !== undefined &&
    (entity.stroke & 0xff) > 0
  );
}
