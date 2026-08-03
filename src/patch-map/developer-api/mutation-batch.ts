import type { PatchMapLogicalTargetSnapshot } from '../query-selection';
import type { PatchMapMutationJsonValue } from '../semantic/transaction';
import type {
  PatchMapComponentUpdate,
  PatchMapComponentUpdateColumns,
  PatchMapUpdate,
  PatchMapUpdateBatch,
  PatchMapUpdateColumn,
  PatchMapUpdateRecord,
} from './contracts';
import {
  ownerId,
  resolveComponent,
  type ComponentType,
  type MutationContext,
  type ResolvedComponent,
} from './mutation-lowering';

const BATCH_FIELDS = new Set([
  'targets',
  'changes',
  'background',
  'bar',
  'icon',
  'text',
]);
const COMPONENT_COLUMN_FIELDS = new Set(['componentId', 'changes']);
const BAR_COLUMN_FIELDS = new Set([
  ...COMPONENT_COLUMN_FIELDS,
  'height',
]);
const TEXT_COLUMN_FIELDS = new Set([
  ...COMPONENT_COLUMN_FIELDS,
  'text',
  'style',
]);

export type ResolvedBarMutation = ResolvedComponent & Readonly<{
  readonly height: number | null;
}>;

export type ResolvedTextMutation = ResolvedComponent & Readonly<{
  readonly text: string;
  readonly style?: Readonly<Record<string, unknown>>;
}>;

export function normalizeBatchInput(input: unknown): PatchMapUpdateBatch {
  const record = dataRecord(input, '$.updateBatch');
  assertKnownDataFields(record, BATCH_FIELDS, '$.updateBatch');
  const targets = requiredDataProperty<PatchMapUpdateBatch['targets']>(
    record,
    'targets',
    '$.updateBatch',
  );
  return Object.freeze({
    targets,
    ...optionalDataField(record, 'changes'),
    ...normalizedComponentField(record, 'background', COMPONENT_COLUMN_FIELDS),
    ...normalizedComponentField(record, 'bar', BAR_COLUMN_FIELDS),
    ...normalizedComponentField(record, 'icon', COMPONENT_COLUMN_FIELDS),
    ...normalizedComponentField(record, 'text', TEXT_COLUMN_FIELDS),
  }) as PatchMapUpdateBatch;
}

export function fastBarUpdate(
  input: PatchMapUpdate,
  preferred: PatchMapLogicalTargetSnapshot | undefined,
  context: MutationContext,
): ResolvedBarMutation | null {
  if (
    input.bar === undefined ||
    input.changes !== undefined ||
    input.background !== undefined ||
    input.icon !== undefined ||
    input.text !== undefined ||
    input.bar.height === undefined ||
    input.bar.changes !== undefined
  ) return null;
  return Object.freeze({
    ...resolveComponent(input.id, 'bar', input.bar.componentId, preferred, context),
    height: input.bar.height,
  });
}

export function fastTextUpdate(
  input: PatchMapUpdate,
  preferred: PatchMapLogicalTargetSnapshot | undefined,
  context: MutationContext,
): ResolvedTextMutation | null {
  if (
    input.text === undefined ||
    input.changes !== undefined ||
    input.background !== undefined ||
    input.bar !== undefined ||
    input.icon !== undefined ||
    input.text.text === undefined ||
    input.text.changes !== undefined ||
    preferred?.type === 'text'
  ) return null;
  const component = resolveComponent(
    input.id,
    'text',
    input.text.componentId,
    preferred,
    context,
  );
  if (component.instance) return null;
  return Object.freeze({
    ...component,
    text: input.text.text,
    ...(input.text.style === undefined ? {} : { style: input.text.style }),
  });
}

export function fastBarBatch(
  input: PatchMapUpdateBatch,
  targets: readonly PatchMapLogicalTargetSnapshot[],
  context: MutationContext,
): readonly ResolvedBarMutation[] | null {
  if (
    input.bar?.height === undefined ||
    input.changes !== undefined ||
    input.background !== undefined ||
    input.icon !== undefined ||
    input.text !== undefined ||
    input.bar.changes !== undefined
  ) return null;
  return Object.freeze(targets.map((target, index) => Object.freeze({
    ...resolveComponent(ownerId(target), 'bar', input.bar!.componentId, target, context),
    height: columnValue(input.bar!.height!, index, 'bar.height'),
  })));
}

export function fastTextBatch(
  input: PatchMapUpdateBatch,
  targets: readonly PatchMapLogicalTargetSnapshot[],
  context: MutationContext,
): readonly ResolvedTextMutation[] | null {
  if (
    input.text?.text === undefined ||
    input.changes !== undefined ||
    input.background !== undefined ||
    input.bar !== undefined ||
    input.icon !== undefined ||
    input.text.changes !== undefined
  ) return null;
  const result = targets.map((target, index) => {
    if (target.kind === 'element' && target.type === 'text') return null;
    const component = resolveComponent(
      ownerId(target),
      'text',
      input.text!.componentId,
      target,
      context,
    );
    if (component.instance) return null;
    return Object.freeze({
      ...component,
      text: columnValue(input.text!.text!, index, 'text.text'),
      ...(input.text!.style === undefined
        ? {}
        : { style: columnValue(input.text!.style, index, 'text.style') }),
    });
  });
  return result.some((entry) => entry === null)
    ? null
    : Object.freeze(result as ResolvedTextMutation[]);
}

export function batchRow(
  input: PatchMapUpdateBatch,
  preferred: PatchMapLogicalTargetSnapshot,
  index: number,
): PatchMapUpdate {
  const component = (type: ComponentType): string | undefined =>
    preferred.kind === 'component' && preferred.type === type ? preferred.id : undefined;
  return Object.freeze({
    id: ownerId(preferred),
    ...(input.changes === undefined
      ? {}
      : { changes: columnRecord(input.changes, index, 'changes') }),
    ...(input.background === undefined ? {} : {
      background: componentBatchRow(input.background, component('background'), index, 'background'),
    }),
    ...(input.bar === undefined ? {} : {
      bar: Object.freeze({
        ...componentBatchRow(input.bar, component('bar'), index, 'bar'),
        ...(input.bar.height === undefined
          ? {}
          : { height: columnValue(input.bar.height, index, 'bar.height') }),
      }),
    }),
    ...(input.icon === undefined ? {} : {
      icon: componentBatchRow(input.icon, component('icon'), index, 'icon'),
    }),
    ...(input.text === undefined ? {} : {
      text: Object.freeze({
        ...componentBatchRow(input.text, component('text'), index, 'text'),
        ...(input.text.text === undefined
          ? {}
          : { text: columnValue(input.text.text, index, 'text.text') }),
        ...(input.text.style === undefined
          ? {}
          : { style: columnValue(input.text.style, index, 'text.style') }),
      }),
    }),
  });
}

export function validateBatchColumns(input: PatchMapUpdateBatch, count: number): void {
  const columns: readonly (readonly [string, ArrayLike<unknown> | undefined])[] = [
    ...recordColumns('changes', input.changes),
    ...componentColumns('background', input.background),
    ...componentColumns('bar', input.bar),
    ...componentColumns('icon', input.icon),
    ...componentColumns('text', input.text),
    ['bar.height', input.bar?.height],
    ['text.text', input.text?.text],
    ['text.style', input.text?.style],
  ];
  let present = 0;
  for (const [name, column] of columns) {
    if (column === undefined) continue;
    present += 1;
    if (columnLength(column, name) !== count) {
      throw new RangeError(`${name} column length must match ${count} targets`);
    }
  }
  if (present === 0) throw new TypeError('updateBatch() requires at least one value column');
}

function componentBatchRow(
  input: PatchMapComponentUpdateColumns,
  preferredComponentId: string | undefined,
  index: number,
  path: string,
): PatchMapComponentUpdate {
  const componentId = input.componentId ?? preferredComponentId;
  return Object.freeze({
    ...(componentId === undefined ? {} : { componentId }),
    ...(input.changes === undefined
      ? {}
      : { changes: columnRecord(input.changes, index, `${path}.changes`) }),
  });
}

function columnRecord(
  columns: Readonly<Record<string, PatchMapUpdateColumn<PatchMapMutationJsonValue>>>,
  index: number,
  path: string,
): PatchMapUpdateRecord {
  return Object.freeze(Object.fromEntries(
    dataEntries(columns, path).map(([key, column]) => [
      key,
      columnValue(column, index, `${path}.${key}`),
    ]),
  ));
}

function componentColumns(
  name: ComponentType,
  input: PatchMapComponentUpdateColumns | undefined,
): readonly (readonly [string, ArrayLike<unknown>])[] {
  return recordColumns(`${name}.changes`, input?.changes);
}

function recordColumns(
  path: string,
  columns: Readonly<Record<string, ArrayLike<unknown>>> | undefined,
): readonly (readonly [string, ArrayLike<unknown>])[] {
  return columns === undefined
    ? Object.freeze([])
    : Object.freeze(dataEntries(columns, path).map(([key, column]) => [
        `${path}.${key}`,
        column,
      ] as const));
}

function dataEntries<T>(record: Readonly<Record<string, T>>, path: string): readonly [string, T][] {
  const entries: [string, T][] = [];
  for (const key of Object.keys(record)) {
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    if (descriptor === undefined || !('value' in descriptor)) {
      throw new TypeError(`${path}.${key} must be a data property`);
    }
    entries.push([key, descriptor.value as T]);
  }
  return entries;
}

function normalizedComponentField(
  input: Readonly<Record<string, unknown>>,
  name: ComponentType,
  fields: ReadonlySet<string>,
): Readonly<Record<string, PatchMapComponentUpdateColumns>> {
  const value = optionalDataProperty(input, name, '$.updateBatch');
  if (value === undefined) return Object.freeze({});
  const record = dataRecord(value, `$.updateBatch.${name}`);
  assertKnownDataFields(record, fields, `$.updateBatch.${name}`);
  return Object.freeze({ [name]: Object.freeze({ ...record }) as PatchMapComponentUpdateColumns });
}

function optionalDataField(
  input: Readonly<Record<string, unknown>>,
  name: string,
): Readonly<Record<string, unknown>> {
  const value = optionalDataProperty(input, name, '$.updateBatch');
  return value === undefined ? Object.freeze({}) : Object.freeze({ [name]: value });
}

function dataRecord(value: unknown, path: string): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${path} must be a plain record`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function assertKnownDataFields(
  input: Readonly<Record<string, unknown>>,
  fields: ReadonlySet<string>,
  path: string,
): void {
  for (const key of Reflect.ownKeys(input)) {
    if (typeof key !== 'string') throw new TypeError(`${path} cannot contain symbol fields`);
    if (!fields.has(key)) throw new TypeError(`${path}.${key} is not a supported field`);
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (descriptor === undefined || !('value' in descriptor)) {
      throw new TypeError(`${path}.${key} must be a data property`);
    }
  }
}

function requiredDataProperty<T>(
  input: Readonly<Record<string, unknown>>,
  name: string,
  path: string,
): T {
  const value = optionalDataProperty(input, name, path);
  if (value === undefined) throw new TypeError(`${path}.${name} is required`);
  return value as T;
}

function optionalDataProperty(
  input: Readonly<Record<string, unknown>>,
  name: string,
  path: string,
): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(input, name);
  if (descriptor === undefined) return undefined;
  if (!('value' in descriptor)) throw new TypeError(`${path}.${name} must be a data property`);
  return descriptor.value;
}

function columnLength(column: ArrayLike<unknown>, path: string): number {
  if (Array.isArray(column) || ArrayBuffer.isView(column)) {
    const length = (column as ArrayLike<unknown>).length;
    if (!Number.isSafeInteger(length) || length < 0) {
      throw new RangeError(`${path} column length must be a non-negative safe integer`);
    }
    return length;
  }
  const descriptor = Object.getOwnPropertyDescriptor(column, 'length');
  if (descriptor === undefined || !('value' in descriptor)) {
    throw new TypeError(`${path} column length must be an own data property`);
  }
  if (!Number.isSafeInteger(descriptor.value) || descriptor.value < 0) {
    throw new RangeError(`${path} column length must be a non-negative safe integer`);
  }
  return descriptor.value as number;
}

function columnValue<T>(column: ArrayLike<T>, index: number, path: string): T {
  const descriptor = Object.getOwnPropertyDescriptor(column, String(index));
  if (descriptor === undefined || !('value' in descriptor)) {
    throw new TypeError(`${path}[${index}] must be a present data property`);
  }
  return descriptor.value as T;
}
