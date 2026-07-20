import {
  CoreV2DatasetError,
  materializeCoreV2Dataset,
  type CoreV2Component,
  type CoreV2Element,
  type MaterializedCoreV2Dataset,
} from './dataset';
import type { CoreV2SemanticTarget } from './probe';

export type CoreV2SemanticMutationDiagnosticReason =
  | 'ambiguous-target'
  | 'invalid-candidate'
  | 'invalid-target'
  | 'invalid-value'
  | 'missing-target'
  | 'unsupported-structure';

export interface CoreV2SemanticMutationDiagnostic {
  readonly reason: CoreV2SemanticMutationDiagnosticReason;
  readonly path: string;
  readonly message: string;
  readonly datasetCode?: CoreV2DatasetError['code'];
}

export type CoreV2SemanticMutationResult =
  | Readonly<{
      status: 'changed';
      changed: true;
      target: CoreV2SemanticTarget;
      candidate: MaterializedCoreV2Dataset;
    }>
  | Readonly<{
      status: 'unchanged';
      changed: false;
      target: CoreV2SemanticTarget;
      candidate: MaterializedCoreV2Dataset;
    }>
  | Readonly<{
      status: 'rejected';
      changed: false;
      target: CoreV2SemanticTarget | null;
      candidate: null;
      diagnostic: CoreV2SemanticMutationDiagnostic;
    }>;

export type CoreV2SemanticRemovalResult =
  | Readonly<{
      status: 'changed';
      changed: true;
      target: Extract<CoreV2SemanticTarget, { readonly kind: 'element' }>;
      candidate: MaterializedCoreV2Dataset;
    }>
  | Readonly<{
      status: 'rejected';
      changed: false;
      target: CoreV2SemanticTarget | null;
      candidate: null;
      diagnostic: CoreV2SemanticMutationDiagnostic;
    }>;

interface LocatedTarget {
  readonly path: string;
  readonly elementType?: CoreV2Element['type'];
}

const ELEMENT_TARGET_FIELDS = new Set(['kind', 'id']);
const COMPONENT_TARGET_FIELDS = new Set(['kind', 'ownerId', 'id']);
const STRUCTURAL_PATCH_FIELDS = new Set([
  'id',
  'type',
  'parent',
  'children',
  'components',
  'item',
  'cells',
  'links',
]);
const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

/**
 * Build and validate an immutable semantic candidate for one stable logical target.
 * This function owns no engine state and never publishes or reloads a render surface.
 */
export function applyCoreV2SemanticPatch(
  current: MaterializedCoreV2Dataset,
  targetInput: CoreV2SemanticTarget,
  patchInput: unknown,
): CoreV2SemanticMutationResult {
  let target: CoreV2SemanticTarget;
  try {
    target = normalizeTarget(targetInput);
  } catch (error) {
    if (!(error instanceof MutationValidationFailure)) throw error;
    return rejected(null, error.diagnostic);
  }

  let patch: Readonly<Record<string, unknown>>;
  try {
    patch = normalizePatch(patchInput);
  } catch (error) {
    if (!(error instanceof MutationValidationFailure)) throw error;
    return rejected(target, error.diagnostic);
  }

  const located = locateTargets(current.dataset, target);
  if (located.length === 0) {
    return rejected(
      target,
      diagnostic('missing-target', '$.target', `No current record matches ${targetLabel(target)}`),
    );
  }
  if (located.length > 1) {
    return rejected(
      target,
      diagnostic(
        'ambiguous-target',
        '$.target',
        `${targetLabel(target)} resolves to ${located.length} current records`,
      ),
    );
  }

  const location = requireAt(located, 0);
  const forbiddenField = Object.keys(patch).find((key) => {
    if (!STRUCTURAL_PATCH_FIELDS.has(key)) return false;
    return !(
      key === 'links' &&
      target.kind === 'element' &&
      location.elementType === 'relations'
    );
  });
  if (forbiddenField !== undefined) {
    return rejected(
      target,
      diagnostic(
        'unsupported-structure',
        `$.patch.${forbiddenField}`,
        `${forbiddenField} requires an explicit structural or replacement operation`,
      ),
    );
  }

  const staged = rewriteDataset(current.dataset, location.path, patch);
  let candidate: MaterializedCoreV2Dataset;
  try {
    candidate = materializeCoreV2Dataset(staged);
  } catch (error) {
    if (!(error instanceof CoreV2DatasetError)) throw error;
    return rejected(
      target,
      diagnostic('invalid-candidate', error.datasetPath, error.message, error.code),
    );
  }

  const changed = !jsonEquivalent(current.dataset, candidate.dataset);
  return Object.freeze({
    status: changed ? 'changed' : 'unchanged',
    changed,
    target,
    candidate,
  }) as CoreV2SemanticMutationResult;
}

/** Build an immutable candidate with one stable logical element removed. */
export function removeCoreV2SemanticTarget(
  current: MaterializedCoreV2Dataset,
  targetInput: CoreV2SemanticTarget,
): CoreV2SemanticRemovalResult {
  let target: CoreV2SemanticTarget;
  try {
    target = normalizeTarget(targetInput);
  } catch (error) {
    if (!(error instanceof MutationValidationFailure)) throw error;
    return removalRejected(null, error.diagnostic);
  }

  if (target.kind !== 'element') {
    return removalRejected(
      target,
      diagnostic(
        'unsupported-structure',
        '$.target.kind',
        'remove currently accepts stable element targets only',
      ),
    );
  }

  const located = locateTargets(current.dataset, target);
  if (located.length === 0) {
    return removalRejected(
      target,
      diagnostic('missing-target', '$.target', `No current record matches ${targetLabel(target)}`),
    );
  }
  if (located.length > 1) {
    return removalRejected(
      target,
      diagnostic(
        'ambiguous-target',
        '$.target',
        `${targetLabel(target)} resolves to ${located.length} current records`,
      ),
    );
  }

  const location = requireAt(located, 0);
  const staged = removeDatasetElement(current.dataset, location.path);
  let candidate: MaterializedCoreV2Dataset;
  try {
    candidate = materializeCoreV2Dataset(staged);
  } catch (error) {
    if (!(error instanceof CoreV2DatasetError)) throw error;
    return removalRejected(
      target,
      diagnostic('invalid-candidate', error.datasetPath, error.message, error.code),
    );
  }

  return Object.freeze({
    status: 'changed',
    changed: true,
    target,
    candidate,
  });
}

function normalizeTarget(value: unknown): CoreV2SemanticTarget {
  if (!isPlainRecord(value)) {
    fail('invalid-target', '$.target', 'target must be a plain object');
  }
  const kind = value.kind;
  const acceptedFields = kind === 'element' ? ELEMENT_TARGET_FIELDS : COMPONENT_TARGET_FIELDS;
  const unknownField = Object.keys(value).find((key) => !acceptedFields.has(key));
  if (unknownField !== undefined) {
    fail('invalid-target', `$.target.${unknownField}`, 'target contains an unknown field');
  }
  if (kind !== 'element' && kind !== 'component') {
    fail('invalid-target', '$.target.kind', "target kind must be 'element' or 'component'");
  }
  if (typeof value.id !== 'string') {
    fail('invalid-target', '$.target.id', 'target id must be a string');
  }
  if (kind === 'element') {
    return Object.freeze({ kind, id: value.id });
  }
  if (typeof value.ownerId !== 'string') {
    fail('invalid-target', '$.target.ownerId', 'component target ownerId must be a string');
  }
  return Object.freeze({ kind, ownerId: value.ownerId, id: value.id });
}

function normalizePatch(value: unknown): Readonly<Record<string, unknown>> {
  if (!isPlainRecord(value)) {
    fail('invalid-value', '$.patch', 'patch must be a strict plain record');
  }
  return cloneJsonRecord(value, '$.patch');
}

function cloneJsonRecord(
  value: Readonly<Record<string, unknown>>,
  path: string,
  ancestors = new Set<object>(),
): Readonly<Record<string, unknown>> {
  if (ancestors.has(value)) {
    fail('invalid-value', path, 'cyclic values are not accepted');
  }
  ancestors.add(value);
  try {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value)) {
      if (UNSAFE_KEYS.has(key)) {
        fail('invalid-value', `${path}.${key}`, 'unsafe property names are not accepted');
      }
      defineDataProperty(result, key, cloneJsonValue(value[key], `${path}.${key}`, ancestors));
    }
    return Object.freeze(result);
  } finally {
    ancestors.delete(value);
  }
}

function cloneJsonValue(value: unknown, path: string, ancestors: Set<object>): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('invalid-value', path, 'numbers must be finite');
    return value;
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value)) fail('invalid-value', path, 'cyclic values are not accepted');
    ancestors.add(value);
    try {
      const clone: unknown[] = [];
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.prototype.hasOwnProperty.call(value, index)) {
          fail('invalid-value', `${path}[${index}]`, 'sparse arrays are not accepted');
        }
        clone.push(cloneJsonValue(value[index], `${path}[${index}]`, ancestors));
      }
      return Object.freeze(clone);
    } finally {
      ancestors.delete(value);
    }
  }
  if (isPlainRecord(value)) return cloneJsonRecord(value, path, ancestors);
  fail('invalid-value', path, 'values must be JSON scalars, arrays, or strict plain records');
}

function locateTargets(
  elements: readonly CoreV2Element[],
  target: CoreV2SemanticTarget,
): readonly LocatedTarget[] {
  const located: LocatedTarget[] = [];
  elements.forEach((element, index) => {
    locateInElement(element, `$[${index}]`, target, located);
  });
  return located;
}

function locateInElement(
  element: CoreV2Element,
  path: string,
  target: CoreV2SemanticTarget,
  located: LocatedTarget[],
): void {
  if (target.kind === 'element' && element.id === target.id) {
    located.push({ path, elementType: element.type });
  }

  if (target.kind === 'component' && element.id === target.ownerId) {
    const components = elementComponents(element);
    components.values.forEach((component, index) => {
      if (component.id === target.id) {
        located.push({
          path: `${path}${components.path}[${index}]`,
        });
      }
    });
  }

  if (element.type === 'group') {
    element.children.forEach((child, index) => {
      locateInElement(child, `${path}.children[${index}]`, target, located);
    });
  }
}

function elementComponents(element: CoreV2Element): Readonly<{
  values: readonly CoreV2Component[];
  path: '.components' | '.item.components';
}> {
  if (element.type === 'item') return { values: element.components, path: '.components' };
  if (element.type === 'grid') return { values: element.item.components, path: '.item.components' };
  return { values: [], path: '.components' };
}

function rewriteDataset(
  elements: readonly CoreV2Element[],
  targetPath: string,
  patch: Readonly<Record<string, unknown>>,
): readonly unknown[] {
  return elements.map((element, index) => rewriteElement(element, `$[${index}]`, targetPath, patch));
}

function removeDatasetElement(
  elements: readonly CoreV2Element[],
  targetPath: string,
): readonly unknown[] {
  return elements.flatMap((element, index) => {
    const next = removeElement(element, `$[${index}]`, targetPath);
    return next === null ? [] : [next];
  });
}

function removeElement(
  element: CoreV2Element,
  path: string,
  targetPath: string,
): CoreV2Element | null {
  if (path === targetPath) return null;
  if (element.type !== 'group') return element;
  return {
    ...element,
    children: element.children.flatMap((child, index) => {
      const next = removeElement(child, `${path}.children[${index}]`, targetPath);
      return next === null ? [] : [next];
    }),
  };
}

function rewriteElement(
  element: CoreV2Element,
  path: string,
  targetPath: string,
  patch: Readonly<Record<string, unknown>>,
): unknown {
  if (path === targetPath) return mergeRecords(element, patch);

  if (element.type === 'group') {
    return {
      ...element,
      children: element.children.map((child, index) =>
        rewriteElement(child, `${path}.children[${index}]`, targetPath, patch),
      ),
    };
  }
  if (element.type === 'item') {
    return {
      ...element,
      components: element.components.map((component, index) => {
        const componentPath = `${path}.components[${index}]`;
        return componentPath === targetPath ? mergeRecords(component, patch) : component;
      }),
    };
  }
  if (element.type === 'grid') {
    return {
      ...element,
      item: {
        ...element.item,
        components: element.item.components.map((component, index) => {
          const componentPath = `${path}.item.components[${index}]`;
          return componentPath === targetPath ? mergeRecords(component, patch) : component;
        }),
      },
    };
  }
  return element;
}

function mergeRecords(
  current: object,
  patch: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(current)) defineDataProperty(result, key, Reflect.get(current, key));
  for (const key of Object.keys(patch)) {
    const previous = Reflect.get(current, key) as unknown;
    const next = patch[key];
    defineDataProperty(
      result,
      key,
      isPlainRecord(previous) && isPlainRecord(next) ? mergeRecords(previous, next) : next,
    );
  }
  return result;
}

function jsonEquivalent(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((entry, index) => jsonEquivalent(entry, right[index]))
    );
  }
  if (!isPlainRecord(left) || !isPlainRecord(right)) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every(
    (key, index) => key === rightKeys[index] && jsonEquivalent(left[key], right[key]),
  );
}

function rejected(
  target: CoreV2SemanticTarget | null,
  mutationDiagnostic: CoreV2SemanticMutationDiagnostic,
): CoreV2SemanticMutationResult {
  return Object.freeze({
    status: 'rejected',
    changed: false,
    target,
    candidate: null,
    diagnostic: mutationDiagnostic,
  });
}

function removalRejected(
  target: CoreV2SemanticTarget | null,
  mutationDiagnostic: CoreV2SemanticMutationDiagnostic,
): Extract<CoreV2SemanticRemovalResult, { readonly status: 'rejected' }> {
  return Object.freeze({
    status: 'rejected',
    changed: false,
    target,
    candidate: null,
    diagnostic: mutationDiagnostic,
  });
}

function diagnostic(
  reason: CoreV2SemanticMutationDiagnosticReason,
  path: string,
  message: string,
  datasetCode?: CoreV2DatasetError['code'],
): CoreV2SemanticMutationDiagnostic {
  return Object.freeze({
    reason,
    path,
    message,
    ...(datasetCode === undefined ? {} : { datasetCode }),
  });
}

function targetLabel(target: CoreV2SemanticTarget): string {
  return target.kind === 'element'
    ? `element:${target.id}`
    : `component:${target.ownerId}/${target.id}`;
}

function requireAt<T>(values: readonly T[], index: number): T {
  const value = values[index];
  if (value === undefined) throw new Error(`Missing value at index ${index}`);
  return value;
}

function isPlainRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function defineDataProperty(target: Record<string, unknown>, key: string, value: unknown): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true,
  });
}

class MutationValidationFailure extends Error {
  public readonly diagnostic: CoreV2SemanticMutationDiagnostic;

  public constructor(mutationDiagnostic: CoreV2SemanticMutationDiagnostic) {
    super(mutationDiagnostic.message);
    this.name = 'MutationValidationFailure';
    this.diagnostic = mutationDiagnostic;
  }
}

function fail(
  reason: Extract<CoreV2SemanticMutationDiagnosticReason, 'invalid-target' | 'invalid-value'>,
  path: string,
  message: string,
): never {
  throw new MutationValidationFailure(diagnostic(reason, path, message));
}
