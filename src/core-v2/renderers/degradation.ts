import type { ParseDiagnostic, ParsePatchMapResult } from '../contracts';
import type { CoreV2RendererStrategy } from './types';

/**
 * Attach renderer-specific fidelity warnings without changing the immutable
 * schema parser result or silently discarding retained style data.
 */
export function withRendererDegradationDiagnostics(
  parse: ParsePatchMapResult,
  strategy: CoreV2RendererStrategy,
): ParsePatchMapResult {
  if (strategy !== 'mesh') return parse;

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
  if (additions.length === 0) return parse;

  return Object.freeze({
    ...parse,
    diagnostics: Object.freeze([...parse.diagnostics, ...additions]),
  });
}
