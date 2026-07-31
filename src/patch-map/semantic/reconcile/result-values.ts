import type {
  CoreOperation,
  CoreView,
  TransactionBatch,
} from '../../dense/contracts';
import { CoreValidationError } from '../../dense/errors';
import type { ParseDiagnostic } from '../../contracts';
import type {
  PatchMapDenseReconcilePlan,
  PatchMapReconcileDiagnostic,
  PatchMapReconcileOptions,
  PatchMapReconcileSummary,
} from './contracts';

export function sameOptionalView(
  left: CoreView | undefined,
  right: CoreView | undefined,
): boolean {
  if (left === right) return true;
  return (
    left !== undefined &&
    right !== undefined &&
    left.x === right.x &&
    left.y === right.y &&
    left.scale === right.scale &&
    (left.rotation ?? 0) === (right.rotation ?? 0)
  );
}

export function normalizedSelectionIds(values: readonly string[]): readonly string[] {
  if (!Array.isArray(values)) throw new TypeError('selectionIds must be an array');
  return Object.freeze([...new Set(values.map((value, index) => {
    if (typeof value !== 'string' || value.length === 0) {
      throw new TypeError(`selectionIds[${index}] must be a non-empty string`);
    }
    return value;
  }))]);
}

export function normalizedView(
  view: CoreView | undefined,
  path: string,
): Readonly<Required<CoreView>> {
  const value = view ?? { x: 0, y: 0, scale: 1, rotation: 0 };
  if (
    !Number.isFinite(value.x) ||
    !Number.isFinite(value.y) ||
    !Number.isFinite(value.scale) ||
    value.scale <= 0 ||
    !Number.isFinite(value.rotation ?? 0)
  ) {
    throw new CoreValidationError(path, 'expected finite x/y/rotation and positive scale');
  }
  return Object.freeze({
    x: value.x,
    y: value.y,
    scale: value.scale,
    rotation: value.rotation ?? 0,
  });
}

export function normalizedBackground(value: number | undefined, path: string): number {
  const background = value ?? 0xf7f8faff;
  if (!Number.isInteger(background) || background < 0 || background > 0xffffffff) {
    throw new CoreValidationError(path, 'expected a packed 0xRRGGBBAA integer');
  }
  return background >>> 0;
}

export function sameView(left: Required<CoreView>, right: Required<CoreView>): boolean {
  return left.x === right.x &&
    left.y === right.y &&
    left.scale === right.scale &&
    left.rotation === right.rotation;
}

export function projectionDiagnostics(
  scope: 'current' | 'candidate',
  diagnostics: readonly ParseDiagnostic[],
): readonly PatchMapReconcileDiagnostic[] {
  return diagnostics.map((diagnostic) => freezeDiagnostic({
    severity: diagnostic.level,
    code: 'DENSE_PROJECTION_DIAGNOSTIC',
    message: diagnostic.message,
    path: diagnostic.path,
    sourceCode: diagnostic.code,
    scope,
  }));
}

export function freezeBatch(
  operations: readonly CoreOperation[],
  options: PatchMapReconcileOptions,
): TransactionBatch {
  return Object.freeze({
    operations,
    ...(options.id === undefined ? {} : { id: options.id }),
    ...(options.recordHistory === undefined ? {} : { recordHistory: options.recordHistory }),
  });
}

export function freezeOperation<T extends CoreOperation>(operation: T): T {
  return Object.freeze(operation);
}

export function freezeDiagnostic(
  diagnostic: PatchMapReconcileDiagnostic,
): PatchMapReconcileDiagnostic {
  return Object.freeze(diagnostic);
}

export function freezePlan(input: {
  readonly batch: TransactionBatch;
  readonly safeToCommit: boolean;
  readonly diagnostics: readonly PatchMapReconcileDiagnostic[];
  readonly summary: PatchMapReconcileSummary;
}): PatchMapDenseReconcilePlan {
  return Object.freeze({
    batch: input.batch,
    safeToCommit: input.safeToCommit,
    diagnostics: Object.freeze([...input.diagnostics]),
    summary: Object.freeze(input.summary),
  });
}

export function detachedValue(value: unknown): unknown {
  if (Array.isArray(value)) return Object.freeze([...(value as readonly unknown[])]);
  return value;
}

export function fieldEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
  return left.every((value, index) => Object.is(value, right[index]));
}
