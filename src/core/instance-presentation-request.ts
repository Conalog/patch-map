import type {
  PatchMapAssetSource,
  PatchMapRectTexture,
} from '../semantic/dataset';
import {
  normalizeAssetSource,
  normalizeColorLike,
  normalizeRectTexture,
} from '../semantic/dataset/style-normalization';
import {
  detachPatchMapMutationJsonValue,
  type PatchMapMutationJsonValue,
} from '../semantic/transaction';
import type {
  PatchMapInstanceBarHeightBatchRequest,
  PatchMapInstanceBarTarget,
  PatchMapInstancePresentationComponentType,
} from './contracts';
import { patchMapComponentTargetKey } from './component-target-key';

export interface NormalizedPresentationPatch {
  readonly type: PatchMapInstancePresentationComponentType;
  readonly target: PatchMapInstanceBarTarget;
  readonly height?: number | null;
  readonly tint?: unknown;
  readonly source?: PatchMapRectTexture | PatchMapAssetSource | null;
  readonly show?: boolean | null;
  readonly changes?: Readonly<Record<string, unknown>>;
}

const INSTANCE_PRESENTATION_BATCH_FIELDS = new Set([
  'background',
  'bar',
  'icon',
  'text',
  'animate',
  'animatedBarTargets',
]);

export function normalizePresentationPatches(
  request: PatchMapInstanceBarHeightBatchRequest,
): readonly NormalizedPresentationPatch[] {
  if (request === null || typeof request !== 'object' || Array.isArray(request)) {
    throw new TypeError('instance presentation batch must be an object');
  }
  if (request.animate !== undefined && typeof request.animate !== 'boolean') {
    throw new TypeError('instance presentation animate must be a boolean');
  }
  const unknownField = Object.keys(request).find(
    (field) => !INSTANCE_PRESENTATION_BATCH_FIELDS.has(field),
  );
  if (unknownField !== undefined) {
    throw new TypeError(`instance presentation batch does not support ${unknownField}`);
  }
  const result: NormalizedPresentationPatch[] = [];
  const normalizedColors = new Map<unknown, unknown>();
  const normalizedBarSources = new Map<unknown, PatchMapRectTexture>();
  const normalizedIconSources = new Map<unknown, PatchMapAssetSource>();
  if (request.background !== undefined) {
    normalizeComponentColumns('background', request.background, result);
  }
  if (request.bar !== undefined) {
    normalizeColumns(
      'bar',
      request.bar,
      result,
      normalizedColors,
      normalizedBarSources,
      normalizedIconSources,
    );
  }
  if (request.icon !== undefined) {
    normalizeColumns(
      'icon',
      request.icon,
      result,
      normalizedColors,
      normalizedBarSources,
      normalizedIconSources,
    );
  }
  if (request.text !== undefined) {
    normalizeComponentColumns('text', request.text, result);
  }
  if (result.length === 0) {
    throw new TypeError('instance presentation batch requires at least one value column');
  }
  return Object.freeze(result);
}

function normalizeColumns(
  type: 'bar' | 'icon',
  columns: Readonly<{
    readonly targets: readonly PatchMapInstanceBarTarget[];
    readonly height?: ArrayLike<number | null>;
    readonly tint?: ArrayLike<unknown>;
    readonly source?: ArrayLike<unknown>;
    readonly show?: ArrayLike<boolean | null>;
  }>,
  output: NormalizedPresentationPatch[],
  normalizedColors: Map<unknown, unknown>,
  normalizedBarSources: Map<unknown, PatchMapRectTexture>,
  normalizedIconSources: Map<unknown, PatchMapAssetSource>,
): void {
  if (!Array.isArray(columns.targets)) {
    throw new TypeError(`instance ${type} targets must be an array`);
  }
  const valueColumns = [columns.height, columns.tint, columns.source, columns.show]
    .filter((value) => value !== undefined);
  if (valueColumns.length === 0) {
    throw new TypeError(`instance ${type} presentation requires at least one value column`);
  }
  for (const [name, column] of [
    ['height', columns.height],
    ['tint', columns.tint],
    ['source', columns.source],
    ['show', columns.show],
  ] as const) {
    if (column === undefined) continue;
    if (column === null || typeof column !== 'object') {
      throw new TypeError(`instance ${type} ${name} must be array-like`);
    }
    const length = instanceColumnLength(column, `instance ${type} ${name}`);
    if (length !== columns.targets.length) {
      throw new RangeError(`instance ${type} ${name} length must match targets length`);
    }
  }
  const seen = new Set<string>();
  for (let index = 0; index < columns.targets.length; index += 1) {
    const target = normalizeTarget(
      instanceColumnValue(columns.targets, index, `instance ${type} targets`),
      `instance ${type} targets[${index}]`,
    );
    const key = patchMapComponentTargetKey(target.id, target.componentId);
    if (seen.has(key)) throw new TypeError(`duplicate instance ${type} target: ${target.id}/${target.componentId}`);
    seen.add(key);
    const height = columns.height === undefined
      ? undefined
      : detachedInstanceColumnValue(columns.height, index, `instance ${type} height`);
    const tint = columns.tint === undefined
      ? undefined
      : detachedInstanceColumnValue(columns.tint, index, `instance ${type} tint`);
    const source = columns.source === undefined
      ? undefined
      : detachedInstanceColumnValue(columns.source, index, `instance ${type} source`);
    const show = columns.show === undefined
      ? undefined
      : detachedInstanceColumnValue(columns.show, index, `instance ${type} show`);
    if (type === 'icon' && height !== undefined) {
      throw new TypeError('instance icon presentation does not support height');
    }
    if (height !== undefined && height !== null &&
      (typeof height !== 'number' || !Number.isFinite(height) || height < 0)) {
      throw new RangeError(`instance bar height[${index}] must be null or finite and non-negative`);
    }
    if (show !== undefined && show !== null && typeof show !== 'boolean') {
      throw new TypeError(`instance ${type} show[${index}] must be null or boolean`);
    }
    output.push(Object.freeze({
      type,
      target,
      ...(height === undefined ? {} : { height }),
      ...(tint === undefined ? {} : {
        tint: tint === null
          ? null
          : cachedNormalize(
              normalizedColors,
              tint,
              () => normalizeColorLike(tint, `instance ${type} tint[${index}]`),
            ),
      }),
      ...(source === undefined ? {} : {
        source: source === null
          ? null
          : type === 'bar'
            ? cachedNormalize(
                normalizedBarSources,
                source,
                () => normalizeRectTexture(source, `instance bar source[${index}]`),
              )
            : cachedNormalize(
                normalizedIconSources,
                source,
                () => normalizeAssetSource(source, `instance icon source[${index}]`),
              ),
      }),
      ...(show === undefined ? {} : { show }),
    }));
  }
}

function normalizeComponentColumns(
  type: 'background' | 'text',
  columns: NonNullable<
    PatchMapInstanceBarHeightBatchRequest['background'] |
    PatchMapInstanceBarHeightBatchRequest['text']
  >,
  output: NormalizedPresentationPatch[],
): void {
  if (!Array.isArray(columns.targets)) {
    throw new TypeError(`instance ${type} targets must be an array`);
  }
  const changes = columns.changes ?? {};
  const directText = type === 'text' && 'text' in columns ? columns.text : undefined;
  const directStyle = type === 'text' && 'style' in columns ? columns.style : undefined;
  const changeEntries = instanceDataEntries(changes, `instance ${type} changes`);
  const allowed = type === 'background'
    ? new Set(['show', 'source', 'tint', 'attrs'])
    : new Set(['show', 'text', 'placement', 'margin', 'tint', 'style', 'split', 'attrs']);
  const unknown = changeEntries.find(([name]) => !allowed.has(name))?.[0];
  if (unknown !== undefined) {
    throw new TypeError(`instance ${type} presentation does not support ${unknown}`);
  }
  if (directText !== undefined && Object.hasOwn(changes, 'text')) {
    throw new TypeError('instance text presentation cannot set text twice');
  }
  if (directStyle !== undefined && Object.hasOwn(changes, 'style')) {
    throw new TypeError('instance text presentation cannot set style twice');
  }
  const valueColumns = [
    ...changeEntries.map(([, value]) => value),
    directText,
    directStyle,
  ].filter((value) => value !== undefined);
  if (valueColumns.length === 0) {
    throw new TypeError(`instance ${type} presentation requires at least one value column`);
  }
  for (const [name, column] of [
    ...changeEntries,
    ['text', directText],
    ['style', directStyle],
  ] as readonly (readonly [string, ArrayLike<unknown> | undefined])[]) {
    if (column === undefined) continue;
    if (column === null || typeof column !== 'object') {
      throw new TypeError(`instance ${type} ${name} must be array-like`);
    }
    const length = instanceColumnLength(column, `instance ${type} ${name}`);
    if (length !== columns.targets.length) {
      throw new RangeError(`instance ${type} ${name} length must match targets length`);
    }
  }

  const seen = new Set<string>();
  for (let index = 0; index < columns.targets.length; index += 1) {
    const target = normalizeTarget(
      instanceColumnValue(columns.targets, index, `instance ${type} targets`),
      `instance ${type} targets[${index}]`,
    );
    const key = patchMapComponentTargetKey(target.id, target.componentId);
    if (seen.has(key)) {
      throw new TypeError(`duplicate instance ${type} target: ${target.id}/${target.componentId}`);
    }
    seen.add(key);
    const patch: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const [name, column] of changeEntries) {
      patch[name] = detachedInstanceColumnValue(
        column,
        index,
        `instance ${type} ${name}`,
      );
    }
    if (directText !== undefined) {
      const text = detachedInstanceColumnValue(directText, index, 'instance text text');
      if (text !== null && typeof text !== 'string') {
        throw new TypeError(`instance text text[${index}] must be null or string`);
      }
      patch.text = text;
    }
    if (directStyle !== undefined) {
      const style = detachedInstanceColumnValue(directStyle, index, 'instance text style');
      if (style !== null && (typeof style !== 'object' || Array.isArray(style))) {
        throw new TypeError(`instance text style[${index}] must be null or a record`);
      }
      patch.style = style;
    }
    output.push(Object.freeze({
      type,
      target,
      changes: Object.freeze(patch),
    }));
  }
}

function instanceColumnLength(column: ArrayLike<unknown>, path: string): number {
  if (Array.isArray(column) || ArrayBuffer.isView(column)) return column.length;
  const descriptor = Object.getOwnPropertyDescriptor(column, 'length');
  if (descriptor === undefined || !('value' in descriptor)) {
    throw new TypeError(`${path} length must be an own data property`);
  }
  if (!Number.isSafeInteger(descriptor.value) || descriptor.value < 0) {
    throw new TypeError(`${path} length must be a non-negative safe integer`);
  }
  return descriptor.value as number;
}

function instanceColumnValue<T>(column: ArrayLike<T>, index: number, path: string): T {
  const descriptor = Object.getOwnPropertyDescriptor(column, String(index));
  if (descriptor === undefined || !('value' in descriptor)) {
    throw new TypeError(`${path}[${index}] must be a present data property`);
  }
  return descriptor.value as T;
}

function detachedInstanceColumnValue(
  column: ArrayLike<unknown>,
  index: number,
  path: string,
): PatchMapMutationJsonValue {
  return detachPatchMapMutationJsonValue(
    instanceColumnValue(column, index, path),
    `${path}[${index}]`,
  );
}

function instanceDataEntries<T>(
  record: Readonly<Record<string, T>>,
  path: string,
): readonly (readonly [string, T])[] {
  const entries: (readonly [string, T])[] = [];
  for (const key of Object.keys(record)) {
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    if (descriptor === undefined || !('value' in descriptor)) {
      throw new TypeError(`${path}.${key} must be a data property`);
    }
    entries.push(Object.freeze([key, descriptor.value as T] as const));
  }
  return Object.freeze(entries);
}

export function normalizeTarget(value: unknown, path: string): PatchMapInstanceBarTarget {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${path} must be an object`);
  }
  const target = value as Readonly<Record<string, unknown>>;
  const id = instanceDataProperty(target, 'id', path);
  const componentId = instanceDataProperty(target, 'componentId', path);
  if (typeof id !== 'string' || id.length === 0) {
    throw new TypeError(`${path.replace(/targets\[\d+\]$/u, 'target')} id must be a non-empty string`);
  }
  if (typeof componentId !== 'string' || componentId.length === 0) {
    throw new TypeError(`${path} componentId must be a non-empty string`);
  }
  return Object.freeze({ id, componentId });
}

function instanceDataProperty(
  record: Readonly<Record<string, unknown>>,
  name: string,
  path: string,
): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, name);
  if (descriptor === undefined) return undefined;
  if (!('value' in descriptor)) {
    throw new TypeError(`${path}.${name} must be a data property`);
  }
  return descriptor.value;
}

function cachedNormalize<T>(
  cache: Map<unknown, T>,
  input: unknown,
  normalize: () => T,
): T {
  const cached = cache.get(input);
  if (cached !== undefined) return cached;
  const normalized = normalize();
  cache.set(input, normalized);
  return normalized;
}
