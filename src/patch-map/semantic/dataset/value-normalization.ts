import {
  PatchMapDatasetError,
  type PatchMapAxisSpacing,
  type PatchMapComponentSize,
  type PatchMapDimension,
  type PatchMapEdges,
  type PatchMapFixedSize,
  type PatchMapRadius,
  type PatchMapUnitDimension,
} from './contracts';

const VECTOR_FIELDS = new Set(['x', 'y']);
const SPACING_FIELDS = new Set(['x', 'y', 'top', 'right', 'bottom', 'left']);
const RADIUS_FIELDS = new Set(['topLeft', 'topRight', 'bottomRight', 'bottomLeft']);

export function normalizeFixedSize(value: unknown, path: string): PatchMapFixedSize {
  if (typeof value === 'number') {
    const size = nonnegativeFiniteNumber(value, path);
    return Object.freeze({ width: size, height: size });
  }
  const record = recordValue(value, path, 'size must be a nonnegative number or {width,height}');
  assertKnownFields(record, new Set(['width', 'height']), path);
  return Object.freeze({
    width: nonnegativeFiniteNumber(requiredField(record, 'width', path), `${path}.width`),
    height: nonnegativeFiniteNumber(requiredField(record, 'height', path), `${path}.height`),
  });
}

export function normalizeComponentSize(value: unknown, path: string): PatchMapComponentSize {
  if (!isRecord(value)) return normalizeDimension(value, path);
  const keys = Object.keys(value);
  if (keys.includes('value') || keys.includes('unit')) return normalizeUnitDimension(value, path);
  assertKnownFields(value, new Set(['width', 'height']), path);
  return Object.freeze({
    width: normalizeDimension(requiredField(value, 'width', path), `${path}.width`),
    height: normalizeDimension(requiredField(value, 'height', path), `${path}.height`),
  });
}

function normalizeDimension(value: unknown, path: string): PatchMapDimension {
  if (typeof value === 'number') return nonnegativeFiniteNumber(value, path);
  if (typeof value === 'string') {
    if (isPercentage(value) || isCalcDimension(value)) return value;
    invalidValue(path, 'dimension string must be a nonnegative percentage or strict calc()');
  }
  if (isRecord(value)) return normalizeUnitDimension(value, path);
  invalidValue(path, 'dimension must be a number, percentage, calc(), or {value,unit}');
}

function normalizeUnitDimension(
  record: Readonly<Record<string, unknown>>,
  path: string,
): PatchMapUnitDimension {
  assertKnownFields(record, new Set(['value', 'unit']), path);
  const value = nonnegativeFiniteNumber(requiredField(record, 'value', path), `${path}.value`);
  const unit = stringValue(requiredField(record, 'unit', path), `${path}.unit`);
  if (unit !== 'px' && unit !== '%') invalidValue(`${path}.unit`, "unit must be 'px' or '%'");
  return Object.freeze({ value, unit });
}

export function normalizeGap(value: unknown, path: string): PatchMapAxisSpacing {
  if (value === undefined) return Object.freeze({ x: 0, y: 0 });
  if (typeof value === 'number') {
    const gap = nonnegativeFiniteNumber(value, path);
    return Object.freeze({ x: gap, y: gap });
  }
  const record = recordValue(value, path, 'gap must be a nonnegative number or {x,y}');
  assertKnownFields(record, VECTOR_FIELDS, path);
  return Object.freeze({
    x: hasOwn(record, 'x') ? nonnegativeFiniteNumber(record.x, `${path}.x`) : 0,
    y: hasOwn(record, 'y') ? nonnegativeFiniteNumber(record.y, `${path}.y`) : 0,
  });
}

export function normalizeEdges(value: unknown, path: string): PatchMapEdges {
  if (value === undefined) return Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 });
  if (typeof value === 'number') {
    const edge = finiteNumber(value, path);
    return Object.freeze({ top: edge, right: edge, bottom: edge, left: edge });
  }
  const record = recordValue(value, path, 'spacing must be a finite number or axis/edge object');
  assertKnownFields(record, SPACING_FIELDS, path);
  const x = hasOwn(record, 'x') ? finiteNumber(record.x, `${path}.x`) : 0;
  const y = hasOwn(record, 'y') ? finiteNumber(record.y, `${path}.y`) : 0;
  return Object.freeze({
    top: hasOwn(record, 'top') ? finiteNumber(record.top, `${path}.top`) : y,
    right: hasOwn(record, 'right') ? finiteNumber(record.right, `${path}.right`) : x,
    bottom: hasOwn(record, 'bottom') ? finiteNumber(record.bottom, `${path}.bottom`) : y,
    left: hasOwn(record, 'left') ? finiteNumber(record.left, `${path}.left`) : x,
  });
}

export function normalizeRadius(value: unknown, path: string): PatchMapRadius {
  if (value === undefined) return 0;
  if (typeof value === 'number') return nonnegativeFiniteNumber(value, path);
  if (Array.isArray(value)) {
    if (value.length !== 4) invalidValue(path, 'corner radius array must contain four entries');
    return Object.freeze([
      nonnegativeFiniteNumber(value[0], `${path}[0]`),
      nonnegativeFiniteNumber(value[1], `${path}[1]`),
      nonnegativeFiniteNumber(value[2], `${path}[2]`),
      nonnegativeFiniteNumber(value[3], `${path}[3]`),
    ] as const);
  }
  const record = recordValue(value, path, 'radius must be a nonnegative number or corner object');
  assertKnownFields(record, RADIUS_FIELDS, path);
  return Object.freeze({
    topLeft: hasOwn(record, 'topLeft')
      ? nonnegativeFiniteNumber(record.topLeft, `${path}.topLeft`)
      : 0,
    topRight: hasOwn(record, 'topRight')
      ? nonnegativeFiniteNumber(record.topRight, `${path}.topRight`)
      : 0,
    bottomRight: hasOwn(record, 'bottomRight')
      ? nonnegativeFiniteNumber(record.bottomRight, `${path}.bottomRight`)
      : 0,
    bottomLeft: hasOwn(record, 'bottomLeft')
      ? nonnegativeFiniteNumber(record.bottomLeft, `${path}.bottomLeft`)
      : 0,
  });
}

export function validateVector(value: unknown, path: string): void {
  if (typeof value === 'number') {
    finiteNumber(value, path);
    return;
  }
  const record = recordValue(value, path, 'transform vector must be a finite scalar or {x,y}');
  assertKnownFields(record, VECTOR_FIELDS, path);
  finiteNumber(requiredField(record, 'x', path), `${path}.x`);
  finiteNumber(requiredField(record, 'y', path), `${path}.y`);
}

export function requiredField(
  record: Readonly<Record<string, unknown>>,
  key: string,
  path: string,
): unknown {
  if (!hasOwn(record, key) || record[key] === undefined) {
    invalidValue(`${path}.${key}`, 'required field is missing');
  }
  return record[key];
}

export function assertKnownFields(
  record: Readonly<Record<string, unknown>>,
  accepted: ReadonlySet<string>,
  path: string,
): void {
  const unknown = Object.keys(record).filter((key) => !accepted.has(key)).sort()[0];
  if (unknown !== undefined) {
    throw new PatchMapDatasetError('UNKNOWN_FIELD', `${path}.${unknown}`, 'field is not in the closed schema');
  }
}

export function enumValue(value: unknown, path: string, accepted: ReadonlySet<string>): string {
  if (typeof value !== 'string' || !accepted.has(value)) {
    invalidValue(path, `value must be one of ${[...accepted].join(', ')}`);
  }
  return value;
}

export function stringValue(value: unknown, path: string): string {
  if (typeof value !== 'string') invalidValue(path, 'value must be a string');
  return value;
}

export function booleanValue(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') invalidValue(path, 'value must be a boolean');
  return value;
}

export function finiteNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    invalidValue(path, 'value must be a finite number');
  }
  return value;
}

export function nonnegativeFiniteNumber(value: unknown, path: string): number {
  const number = finiteNumber(value, path);
  if (number < 0) invalidValue(path, 'value must be nonnegative');
  return number;
}

export function positiveFiniteNumber(value: unknown, path: string): number {
  const number = finiteNumber(value, path);
  if (number <= 0) invalidValue(path, 'value must be positive');
  return number;
}

export function rangedNumber(
  value: unknown,
  path: string,
  minimum: number,
  maximum: number,
): number {
  const number = finiteNumber(value, path);
  if (number < minimum || number > maximum) {
    invalidValue(path, `value must be from ${minimum} through ${maximum}`);
  }
  return number;
}

export function recordValue(
  value: unknown,
  path: string,
  detail: string,
): Readonly<Record<string, unknown>> {
  if (!isRecord(value)) invalidValue(path, detail);
  return value;
}

export function cloneJsonRecord(
  value: Readonly<Record<string, unknown>>,
  path: string,
): Readonly<Record<string, unknown>> {
  return cloneJsonValue(value, path) as Readonly<Record<string, unknown>>;
}

export function cloneJsonArray(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) invalidValue(path, 'value must be an array');
  return cloneJsonValue(value, path) as readonly unknown[];
}

export function cloneJsonValue(
  value: unknown,
  path: string,
  ancestors = new Set<object>(),
): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return finiteNumber(value, path);
  if (typeof value !== 'object') invalidValue(path, 'value must be JSON-cloneable');
  if (ancestors.has(value)) invalidValue(path, 'cyclic values are not accepted by the JSON dataset boundary');
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return Object.freeze(
        value.map((entry, index) => cloneJsonValue(entry, `${path}[${index}]`, ancestors)),
      );
    }
    if (!isRecord(value)) invalidValue(path, 'value must be a JSON object or array');
    const clone: Record<string, unknown> = {};
    for (const key of Object.keys(value)) {
      defineDataProperty(clone, key, cloneJsonValue(value[key], `${path}.${key}`, ancestors));
    }
    return Object.freeze(clone);
  } finally {
    ancestors.delete(value);
  }
}

function isPercentage(value: string): boolean {
  return /^(?:\d+(?:\.\d+)?|\.\d+)%$/.test(value);
}

function isCalcDimension(value: string): boolean {
  const term = '[+-]?(?:\\d+(?:\\.\\d+)?|\\.\\d+)(?:px|%)';
  return new RegExp(`^calc\\(${term}(?: \\+ ${term}| - ${term})*\\)$`).test(value);
}

export function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function hasOwn(record: Readonly<Record<string, unknown>>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

export function defineDataProperty(
  target: Record<string, unknown>,
  key: string,
  value: unknown,
): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true,
  });
}

export function invalidValue(path: string, detail: string): never {
  throw new PatchMapDatasetError('INVALID_VALUE', path, detail);
}
