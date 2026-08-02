import type { PatchMapHistoryDirection } from '../history';
import type { PatchMapInteractionMode } from '../host-interaction';
import type { PatchMapMutationJsonValue, PatchMapMutationTarget } from '../semantic/transaction';
import type { PatchMapTransformerHandle } from '../selection-transformer';
import type { PatchMapTransformerEditKind } from '../transformer-edit';
import type { PatchMapEngineExtractionRequest } from './contracts/extraction';
import type { PatchMapHistoryShortcutInput } from './contracts/history-transformer';
import type { PatchMapInitializeOptions } from './contracts/product';
import type { PatchMapPoint } from './surface-contract';

export function normalizeOptionalSourceRevision(value: unknown): number | undefined {
  return value === undefined ? undefined : positiveSafeInteger(value, 'sourceRevision');
}

export function positiveSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new RangeError(`${label} must be a positive safe integer`);
  }
  return value as number;
}

export function nonEmptyValue(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value;
}

export function validateInitializeOptions(options: PatchMapInitializeOptions): void {
  if (!options.instanceId) throw new TypeError('instanceId must be a non-empty string');
  for (const [name, value] of [['width', options.width], ['height', options.height]] as const) {
    if (!(value > 0) || !Number.isFinite(value)) throw new RangeError(`${name} must be positive and finite`);
  }
  if (options.pixelRatio !== undefined && (!(options.pixelRatio > 0) || !Number.isFinite(options.pixelRatio))) {
    throw new RangeError('pixelRatio must be positive and finite');
  }
}

export function normalizeBackground(value: number | string): number {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) throw new TypeError('invalid background color');
    return value >>> 0;
  }
  const match = /^#([0-9a-f]{6}|[0-9a-f]{8})$/i.exec(value);
  if (!match) throw new TypeError('background must be #rrggbb or #rrggbbaa');
  const body = match[1]!;
  return Number.parseInt(body.length === 6 ? `${body}ff` : body, 16) >>> 0;
}

export function validateExtractionRequest(request: PatchMapEngineExtractionRequest): void {
  if (request.mime !== 'image/png') {
    throw new TypeError('extractPublishedScene mime must be image/png');
  }
  if (
    !Array.isArray(request.cssSize) ||
    request.cssSize.length !== 2 ||
    !request.cssSize.every((value) => Number.isFinite(value) && value > 0)
  ) {
    throw new RangeError('extractPublishedScene cssSize must contain two positive finite values');
  }
  for (const key of ['scene', 'view', 'interaction'] as const) {
    const value = request.targetTuple[key];
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new RangeError(`extractPublishedScene targetTuple.${key} must be non-negative`);
    }
  }
}

export function validatePositiveFinite(name: string, value: number): void {
  if (!(value > 0) || !Number.isFinite(value)) throw new RangeError(`${name} must be positive and finite`);
}

export function validateNonNegativeFinite(name: string, value: number): void {
  if (value < 0 || !Number.isFinite(value)) {
    throw new RangeError(`${name} must be non-negative and finite`);
  }
}

export function validatePoint(point: PatchMapPoint, operation: string): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new RangeError(`${operation} point must contain finite coordinates`);
  }
}

export function finiteTuple(
  value: readonly [number, number],
  label: string,
): readonly [number, number] {
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    !Number.isFinite(value[0]) ||
    !Number.isFinite(value[1])
  ) {
    throw new RangeError(`${label} must contain two finite coordinates`);
  }
  return Object.freeze([value[0], value[1]]);
}

export function resolvePatchMapHistoryShortcut(
  input: PatchMapHistoryShortcutInput,
): PatchMapHistoryDirection | null {
  if (input === null || typeof input !== 'object') {
    throw new TypeError('history shortcut input must be an object');
  }
  if (typeof input.key !== 'string') {
    throw new TypeError('history shortcut key must be a string');
  }
  if (
    typeof input.ctrlKey !== 'boolean' ||
    typeof input.metaKey !== 'boolean' ||
    typeof input.shiftKey !== 'boolean'
  ) {
    throw new TypeError('history shortcut modifiers must be booleans');
  }
  if (input.ctrlKey === input.metaKey) return null;
  const key = input.key.toLowerCase();
  if (key === 'z') return input.shiftKey ? 'redo' : 'undo';
  if (key === 'y' && !input.shiftKey) return 'redo';
  return null;
}

export function assertTransformerHandleKind(
  handle: PatchMapTransformerHandle,
  kind: PatchMapTransformerEditKind,
): void {
  const resolved = handle === 'frame'
    ? 'move'
    : handle === 'rotate'
      ? 'rotate'
      : 'resize';
  if (resolved !== kind) {
    throw new TypeError(`transformer ${handle} handle cannot begin a ${kind} edit`);
  }
}

export function isPatchMapInteractionMode(value: unknown): value is PatchMapInteractionMode {
  return value === 'select' ||
    value === 'pan' ||
    value === 'transform' ||
    value === 'relation-paint' ||
    value === 'text-edit';
}

export function isPatchMapHistoryCompanionRecord(
  value: unknown,
): value is Readonly<Record<string, PatchMapMutationJsonValue>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeEngineMutationTarget(value: unknown): PatchMapMutationTarget {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('target must be an object');
  }
  const record = value as Readonly<Record<string, unknown>>;
  if (record.kind === 'element' && typeof record.id === 'string' && record.id.length > 0) {
    if (Object.keys(record).some((key) => key !== 'kind' && key !== 'id')) {
      throw new TypeError('element target contains an unknown field');
    }
    return Object.freeze({ kind: 'element', id: record.id });
  }
  if (
    record.kind === 'component' &&
    typeof record.ownerId === 'string' &&
    record.ownerId.length > 0 &&
    typeof record.id === 'string' &&
    record.id.length > 0
  ) {
    if (Object.keys(record).some((key) => !['kind', 'ownerId', 'id'].includes(key))) {
      throw new TypeError('component target contains an unknown field');
    }
    return Object.freeze({ kind: 'component', ownerId: record.ownerId, id: record.id });
  }
  throw new TypeError('target must be an element or owner-qualified component');
}

export function normalizeSnapshotTarget(value: unknown): PatchMapMutationTarget | null {
  if (value === null || typeof value !== 'object') return null;
  try {
    return normalizeEngineMutationTarget(Reflect.get(value, 'target'));
  } catch {
    return null;
  }
}
