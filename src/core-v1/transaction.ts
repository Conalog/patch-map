import type {
  AnimatableProperty,
  CoreOperation,
  CoreTarget,
  CoreView,
  EntityInput,
  TransactionBatch,
} from './contracts';
import { CoreTargetError, CoreValidationError } from './errors';
import type { DenseStore } from './store';
import { type CanonicalEntity, KindCode, normalizeEntity, validatePatch } from './validation';

export interface PreparedAnimation {
  readonly id: string;
  readonly property: AnimatableProperty;
  readonly to: number;
  readonly durationMs: number;
  readonly easing: 'linear' | 'easeInOut';
}

export interface PreparedTransaction {
  readonly batch: TransactionBatch;
  readonly before: ReadonlyMap<string, CanonicalEntity | null>;
  readonly after: ReadonlyMap<string, CanonicalEntity | null>;
  readonly replacements: ReadonlySet<string>;
  readonly selectionBefore: ReadonlySet<string>;
  readonly selectionAfter: ReadonlySet<string>;
  readonly viewBefore: CoreView;
  readonly viewAfter: CoreView;
  readonly animations: readonly PreparedAnimation[];
}

export function prepareTransaction(
  store: DenseStore,
  batch: TransactionBatch,
  selectedIds: ReadonlySet<string>,
): PreparedTransaction {
  const rawOperations = (batch as unknown as { operations?: unknown })?.operations;
  if (typeof batch !== 'object' || batch === null || !Array.isArray(rawOperations)) {
    throw new CoreValidationError('$', 'expected a transaction batch with an operations array');
  }
  if (batch.id !== undefined && (typeof batch.id !== 'string' || batch.id.length === 0)) {
    throw new CoreValidationError('$.id', 'expected a non-empty string');
  }

  const overlay = new Map<string, CanonicalEntity | null>();
  const before = new Map<string, CanonicalEntity | null>();
  const replacements = new Set<string>();
  const removed = new Set<string>();
  const invalidatedRefIds = new Set<string>();
  const selection = new Set(selectedIds);
  const animations = new Map<string, PreparedAnimation>();
  let view = store.view;

  const original = (id: string): CanonicalEntity | null => {
    const slot = store.slotOf(id);
    return slot === undefined ? null : normalizeEntity(store.toInput(slot), '$.existing');
  };

  const remember = (id: string): void => {
    if (!before.has(id)) before.set(id, original(id));
  };

  const current = (id: string): CanonicalEntity | null => {
    if (overlay.has(id)) return overlay.get(id) ?? null;
    return original(id);
  };

  const resolveId = (target: CoreTarget, path: string): string => {
    if (typeof target === 'string') {
      if (target.length === 0) throw new CoreValidationError(path, 'expected a non-empty target ID');
      return target;
    }
    const slot = store.resolve(target);
    if (slot === undefined) throw new CoreTargetError(`${target.slot}@${target.generation}`);
    const id = store.ids[slot] ?? '';
    if (invalidatedRefIds.has(id)) throw new CoreTargetError(`${target.slot}@${target.generation}`);
    return id;
  };

  const operations: readonly CoreOperation[] = batch.operations;
  for (let index = 0; index < operations.length; index += 1) {
    const operation = operations[index];
    const path = `$.operations[${index}]`;
    if (operation === undefined || typeof operation.type !== 'string') {
      throw new CoreValidationError(path, 'expected an operation object');
    }
    switch (operation.type) {
      case 'add': {
        const entity = normalizeEntity(operation.entity, `${path}.entity`);
        if (current(entity.id)) throw new CoreValidationError(`${path}.entity.id`, `duplicate ID ${entity.id}`);
        remember(entity.id);
        if (removed.has(entity.id) && before.get(entity.id)) replacements.add(entity.id);
        overlay.set(entity.id, entity);
        removed.delete(entity.id);
        break;
      }
      case 'patch': {
        const id = resolveId(operation.target, `${path}.target`);
        const entity = current(id);
        if (!entity) throw new CoreTargetError(id);
        validatePatch(operation.changes, entity.kind, `${path}.changes`);
        remember(id);
        overlay.set(id, normalizeEntity(mergeCanonical(entity, operation.changes), `${path}.changes`));
        break;
      }
      case 'remove': {
        const id = resolveId(operation.target, `${path}.target`);
        if (!current(id)) throw new CoreTargetError(id);
        remember(id);
        overlay.set(id, null);
        removed.add(id);
        invalidatedRefIds.add(id);
        selection.delete(id);
        for (const key of animations.keys()) {
          if (key.startsWith(`${id}\0`)) animations.delete(key);
        }
        break;
      }
      case 'visibility': {
        const id = resolveId(operation.target, `${path}.target`);
        const entity = current(id);
        if (!entity) throw new CoreTargetError(id);
        if (typeof operation.visible !== 'boolean') {
          throw new CoreValidationError(`${path}.visible`, 'expected a boolean');
        }
        remember(id);
        overlay.set(
          id,
          normalizeEntity(mergeCanonical(entity, { visible: operation.visible }), `${path}.visible`),
        );
        break;
      }
      case 'animate': {
        const id = resolveId(operation.target, `${path}.target`);
        const entity = current(id);
        if (!entity) throw new CoreTargetError(id);
        validateAnimation(operation, entity, path);
        animations.set(`${id}\0${operation.property}`, {
          id,
          property: operation.property,
          to: operation.to,
          durationMs: operation.durationMs,
          easing: operation.easing ?? 'linear',
        });
        break;
      }
      case 'view':
        view = validateView(operation.view, `${path}.view`);
        break;
      case 'selection': {
        const ids = operation.targets.map((target: CoreTarget, targetIndex: number) => {
          const id = resolveId(target, `${path}.targets[${targetIndex}]`);
          if (!current(id)) throw new CoreTargetError(id);
          return id;
        });
        const mode = operation.mode ?? 'replace';
        if (!['replace', 'add', 'remove', 'toggle'].includes(mode)) {
          throw new CoreValidationError(`${path}.mode`, 'expected replace, add, remove, or toggle');
        }
        if (mode === 'replace') {
          selection.clear();
          for (const id of ids) selection.add(id);
        } else if (mode === 'add') {
          for (const id of ids) selection.add(id);
        } else if (mode === 'remove') {
          for (const id of ids) selection.delete(id);
        } else {
          for (const id of ids) {
            if (selection.has(id)) selection.delete(id);
            else selection.add(id);
          }
        }
        break;
      }
      default:
        throw new CoreValidationError(
          `${path}.type`,
          `unsupported operation ${String((operation as unknown as { type?: unknown }).type)}`,
        );
    }
  }

  validateFinalRelations(store, overlay, current, removed);
  for (const animation of animations.values()) {
    if (!current(animation.id)) animations.delete(`${animation.id}\0${animation.property}`);
  }

  return {
    batch,
    before,
    after: overlay,
    replacements,
    selectionBefore: new Set(selectedIds),
    selectionAfter: selection,
    viewBefore: store.view,
    viewAfter: view,
    animations: Object.freeze([...animations.values()]),
  };
}

function mergeCanonical(entity: CanonicalEntity, patch: object): EntityInput {
  return { ...entity, ...patch } as unknown as EntityInput;
}

function validateView(view: CoreView, path: string): CoreView {
  if (typeof view !== 'object' || view === null) throw new CoreValidationError(path, 'expected a view object');
  if (!Number.isFinite(view.x)) throw new CoreValidationError(`${path}.x`, 'expected a finite number');
  if (!Number.isFinite(view.y)) throw new CoreValidationError(`${path}.y`, 'expected a finite number');
  if (!Number.isFinite(view.scale) || view.scale <= 0) {
    throw new CoreValidationError(`${path}.scale`, 'expected a positive finite number');
  }
  if (view.rotation !== undefined && !Number.isFinite(view.rotation)) {
    throw new CoreValidationError(`${path}.rotation`, 'expected a finite number');
  }
  return Object.freeze({ ...view });
}

function validateAnimation(
  operation: Extract<CoreOperation, { type: 'animate' }>,
  entity: CanonicalEntity,
  path: string,
): void {
  if (!Number.isFinite(operation.to)) {
    throw new CoreValidationError(`${path}.to`, 'expected a finite number');
  }
  if (!Number.isFinite(operation.durationMs) || operation.durationMs < 0) {
    throw new CoreValidationError(`${path}.durationMs`, 'expected a non-negative finite number');
  }
  if (operation.easing !== undefined && !['linear', 'easeInOut'].includes(operation.easing)) {
    throw new CoreValidationError(`${path}.easing`, 'expected linear or easeInOut');
  }
  if (entity.kind === 'relation') {
    throw new CoreValidationError(`${path}.property`, 'relations do not expose animatable geometry');
  }
  if (operation.property === 'value' && entity.kind !== 'bar') {
    throw new CoreValidationError(`${path}.property`, 'value animation requires a bar entity');
  }
}

function validateFinalRelations(
  store: DenseStore,
  overlay: ReadonlyMap<string, CanonicalEntity | null>,
  current: (id: string) => CanonicalEntity | null,
  removed: ReadonlySet<string>,
): void {
  const validate = (entity: CanonicalEntity): void => {
    if (entity.kind !== 'relation') return;
    if (!current(entity.from)) throw new CoreValidationError(`relation.${entity.id}.from`, `unknown ID ${entity.from}`);
    if (!current(entity.to)) throw new CoreValidationError(`relation.${entity.id}.to`, `unknown ID ${entity.to}`);
  };
  if (removed.size > 0) {
    for (const slot of store.renderOrder()) {
      if (store.kind[slot] !== KindCode.Relation) continue;
      const id = store.ids[slot] ?? '';
      if (overlay.has(id)) continue;
      const from = store.relationFromId[slot] ?? '';
      const to = store.relationToId[slot] ?? '';
      if (removed.has(from) && !current(from)) {
        throw new CoreValidationError(`relation.${id}.from`, `unknown ID ${from}`);
      }
      if (removed.has(to) && !current(to)) {
        throw new CoreValidationError(`relation.${id}.to`, `unknown ID ${to}`);
      }
    }
  }
  for (const entity of overlay.values()) {
    if (!entity) continue;
    validate(entity);
  }
}
