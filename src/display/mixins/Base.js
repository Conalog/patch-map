import { isValidationError } from 'zod-validation-error';
import { UpdateCommand } from '../../command/commands/update';
import { deepMerge } from '../../utils/deepmerge/deepmerge';
import { diffReplace } from '../../utils/diff/diff-replace';
import { isSame } from '../../utils/diff/is-same';
import { validate } from '../../utils/validator';
import { normalizeChanges } from '../normalize';
import { Type } from './Type';

const RAW_SYNC_KEYS = ['id', 'label', 'attrs'];
const TRANSFORM_SYNC_KEYS = new Set([
  'x',
  'y',
  'width',
  'height',
  'angle',
  'rotation',
  'scale',
  'skew',
  'pivot',
]);

const getPatchDiff = (currentProps, changes) => {
  if (
    !changes ||
    typeof changes !== 'object' ||
    Array.isArray(changes) ||
    Object.getPrototypeOf(currentProps) !== Object.getPrototypeOf(changes)
  ) {
    return diffReplace(currentProps, changes);
  }

  const diff = {};
  const patchKeys = Object.keys(changes);
  for (const key of patchKeys) {
    const currentValue = currentProps[key];
    const nextValue = changes[key];
    if (!isSame(currentValue, nextValue)) {
      diff[key] = nextValue;
    }
  }
  return diff;
};

export const Base = (superClass) => {
  const MixedClass = class extends Type(superClass) {
    static _handlerMap = new Map();
    static _handlerRegistry = new Map();
    static _handlerOrder = 0;
    static _handlerList = [];
    #store;

    constructor(options = {}) {
      const { store = null, ...rest } = options;
      super(rest);
      this.#store = store;
      this.props = rest?.type ? { type: rest.type } : {};
      this.onRender = () => {
        if (
          this.#store?.viewport?.moving ||
          this.#store?.viewport?._suspendObjectAfterRender
        ) {
          return;
        }
        this._afterRender();
      };
    }

    get store() {
      return this.#store;
    }

    _afterRender() {}

    _emitObjectTransformed() {
      if (this.parent?.type === 'item' || !this.visible) {
        return;
      }

      this.updateLocalTransform?.();
      this.store.viewport?.emit('object_transformed', this);
    }

    destroy(options) {
      this.onRender = null;
      this._removeFromStoreElementIndex();
      super.destroy(options);
    }

    static registerHandler(keys, handler, stage) {
      if (!Object.hasOwn(this, '_handlerRegistry')) {
        this._handlerRegistry = new Map(this._handlerRegistry);
        this._handlerMap = new Map(this._handlerMap);
        this._handlerOrder = this._handlerOrder ?? 0;
        this._handlerList = [...this._handlerList];

        for (const [key, handlers] of this._handlerMap.entries()) {
          const normalizedHandlers = new Set();
          for (const entry of handlers) {
            if (typeof entry === 'function') {
              normalizedHandlers.add(entry);
            } else if (entry?.handler) {
              normalizedHandlers.add(entry.handler);
            }
          }
          this._handlerMap.set(key, normalizedHandlers);
        }
      }

      let entry = this._handlerRegistry.get(handler);
      if (!entry) {
        entry = {
          handler,
          keys: new Set(),
          stage: stage ?? 99,
          order: this._handlerOrder++,
        };
        this._handlerRegistry.set(handler, entry);
        const insertAt = this._handlerList.findIndex(
          (item) =>
            item.stage > entry.stage ||
            (item.stage === entry.stage && item.order > entry.order),
        );
        if (insertAt === -1) {
          this._handlerList.push(entry);
        } else {
          this._handlerList.splice(insertAt, 0, entry);
        }
      }

      keys.forEach((key) => {
        if (entry.keys.has(key)) return;
        entry.keys.add(key);
        let handlers = this._handlerMap.get(key);
        if (!handlers) {
          handlers = new Set();
          this._handlerMap.set(key, handlers);
        }
        handlers.add(handler);
      });
    }

    apply(_changes = {}, schema, options = {}) {
      if (this.destroyed) return;
      const changes = _changes ?? {};
      const {
        mergeStrategy = 'merge',
        refresh = false,
        validateSchema = true,
        normalize = true,
      } = options;

      const diffProps = getPatchDiff(this.props, changes);
      const actualChanges = refresh ? { ...this.props } : diffProps;
      const keysToProcess = refresh
        ? Object.keys(this.props)
        : Object.keys(actualChanges);
      if (keysToProcess.length === 0) return;

      if (options?.historyId && this.store.undoRedoManager) {
        const command = new UpdateCommand(this, changes, options);
        this.store?.undoRedoManager.execute(command, options);
        return;
      }

      const normalizedChanges = normalize
        ? normalizeChanges(changes, this.type)
        : changes;

      const mergedProps =
        mergeStrategy === 'replace'
          ? { ...this.props, ...normalizedChanges }
          : deepMerge(this.props, normalizedChanges);

      const normalizedProps = mergedProps;
      const validatedProps = validateSchema
        ? validate(normalizedProps, schema)
        : normalizedProps;
      if (isValidationError(validatedProps)) {
        throw validatedProps;
      }

      this.props = validatedProps;

      if (RAW_SYNC_KEYS.some((key) => Object.hasOwn(diffProps, key))) {
        const previousId = this.id;
        const { id, label, attrs } = diffProps;
        this._applyRaw({ id, label, ...attrs }, mergeStrategy);
        this._syncStoreElementIndex(previousId);
      }

      const handlerChanges = options.changes ?? normalizedChanges;
      this._applyHandlers(keysToProcess, {
        mergeStrategy,
        refresh,
        validateSchema,
        normalize,
        changes: handlerChanges,
      });

      if (this.parent?._onChildUpdate) {
        this.parent._onChildUpdate(
          this.id,
          refresh ? this.props : handlerChanges,
          mergeStrategy,
        );
      }
    }

    _applyInitialTrusted(changes = {}, options = {}) {
      if (this.destroyed) return;
      const initialProps = changes ?? {};
      const keysToProcess = Object.keys(initialProps);
      if (keysToProcess.length === 0) return;

      const previousId = this.id;
      this.props = initialProps;

      if (RAW_SYNC_KEYS.some((key) => Object.hasOwn(initialProps, key))) {
        const { id, label, attrs } = initialProps;
        this._applyRaw(
          { id, label, ...attrs },
          options.mergeStrategy ?? 'replace',
        );
        this._syncStoreElementIndex(previousId);
      }

      this._applyHandlers(keysToProcess, {
        ...options,
        mergeStrategy: options.mergeStrategy ?? 'replace',
        validateSchema: false,
        normalize: false,
        changes: initialProps,
      });
    }

    _applyHandlers(keysToProcess, options) {
      if (keysToProcess.length === 0) return;
      const handlerMap = this.constructor._handlerMap;
      const handlerList = this.constructor._handlerList;
      const handlerRegistry = this.constructor._handlerRegistry;
      if (handlerMap.size === 0 || handlerList.length === 0) return;

      const candidates = new Map();
      for (const key of keysToProcess) {
        const handlers = handlerMap.get(key);
        if (!handlers) continue;
        for (const entryOrHandler of handlers) {
          if (typeof entryOrHandler === 'function') {
            const registryEntry = handlerRegistry.get(entryOrHandler);
            if (!registryEntry) continue;
            if (!candidates.has(registryEntry)) {
              candidates.set(registryEntry, entryOrHandler);
            }
            continue;
          }
          if (entryOrHandler?.handler && !candidates.has(entryOrHandler)) {
            candidates.set(entryOrHandler, entryOrHandler.handler);
          }
        }
      }
      if (candidates.size === 0) return;

      for (const entry of handlerList) {
        const handler = candidates.get(entry);
        if (!handler) continue;
        const payload = {};
        for (const key of entry.keys) {
          if (Object.hasOwn(this.props, key)) {
            payload[key] = this.props[key];
          }
        }
        handler.call(this, payload, options);
      }
    }

    _applyRaw(attrs, mergeStrategy) {
      let transformChanged = false;
      for (const [key, value] of Object.entries(attrs)) {
        if (value === undefined) {
          if (!['id', 'label'].includes(key)) {
            delete this[key];
            transformChanged ||= TRANSFORM_SYNC_KEYS.has(key);
          }
        } else if (key === 'x' || key === 'y') {
          const x = key === 'x' ? value : (attrs?.x ?? this.x);
          const y = key === 'y' ? value : (attrs?.y ?? this.y);
          this.position.set(x, y);
          transformChanged = true;
        } else if (key === 'width' || key === 'height') {
          const width = key === 'width' ? value : (attrs?.width ?? this.width);
          const height =
            key === 'height' ? value : (attrs?.height ?? this.height);
          this.setSize(width, height);
          transformChanged = true;
        } else {
          this._updateProperty(key, value, mergeStrategy);
          transformChanged ||= TRANSFORM_SYNC_KEYS.has(key);
        }
      }
      if (transformChanged) {
        this._emitObjectTransformed();
      }
    }

    _updateProperty(key, value, mergeStrategy) {
      deepMerge(this, { [key]: value }, { mergeStrategy });
    }

    _syncStoreElementIndex(previousId) {
      const elementById = this.store?.elementById;
      if (!elementById) return;

      if (
        previousId &&
        previousId !== this.id &&
        elementById.get(previousId) === this
      ) {
        elementById.delete(previousId);
      }
      if (this.id) {
        elementById.set(this.id, this);
      }
    }

    _removeFromStoreElementIndex() {
      const elementById = this.store?.elementById;
      if (!elementById || !this.id) return;
      if (elementById.get(this.id) === this) {
        elementById.delete(this.id);
      }
    }
  };

  return MixedClass;
};
