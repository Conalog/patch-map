import { Matrix } from 'pixi.js';
import { isValidationError } from 'zod-validation-error';
import { UpdateCommand } from '../../command/commands/update';
import { deepMerge } from '../../utils/deepmerge/deepmerge';
import { diffReplace } from '../../utils/diff/diff-replace';
import { isSame } from '../../utils/diff/is-same';
import { validate } from '../../utils/validator';
import { normalizeChanges } from '../normalize';
import { Type } from './Type';

const tempMatrix = new Matrix();
const RAW_SYNC_KEYS = ['id', 'label', 'attrs'];

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
  return class extends Type(superClass) {
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

      this._lastLocalTransform = tempMatrix.clone();
      this.onRender = () => {
        this._onObjectUpdate();
        this._afterRender();
      };
    }

    get store() {
      return this.#store;
    }

    _afterRender() {}

    _onObjectUpdate() {
      if (
        this.parent?.type === 'item' ||
        !this.localTransform ||
        !this.visible
      ) {
        return;
      }

      if (!this.localTransform.equals(this._lastLocalTransform)) {
        this.store.viewport?.emit('object_transformed', this);
        this._lastLocalTransform.copyFrom(this.localTransform);
      }
    }

    destroy(options) {
      this.onRender = null;
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

      const mergedProps =
        mergeStrategy === 'replace'
          ? { ...this.props, ...changes }
          : deepMerge(this.props, changes);

      const normalizedProps = normalize
        ? normalizeChanges(mergedProps, this.type)
        : mergedProps;
      const validatedProps = validateSchema
        ? validate(normalizedProps, schema)
        : normalizedProps;
      if (isValidationError(validatedProps)) {
        throw validatedProps;
      }

      this.props = validatedProps;

      if (RAW_SYNC_KEYS.some((key) => Object.hasOwn(diffProps, key))) {
        const { id, label, attrs } = diffProps;
        this._applyRaw({ id, label, ...attrs }, mergeStrategy);
      }

      const handlerChanges =
        options.changes ??
        (normalize ? normalizeChanges(changes, this.type) : changes);
      this._applyHandlers(keysToProcess, {
        mergeStrategy,
        refresh,
        changes: handlerChanges,
      });

      if (this.parent?._onChildUpdate) {
        this.parent._onChildUpdate(this.id, actualChanges, mergeStrategy);
      }
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
      for (const [key, value] of Object.entries(attrs)) {
        if (value === undefined) {
          if (!['id', 'label'].includes(key)) {
            delete this[key];
          }
        } else if (key === 'x' || key === 'y') {
          const x = key === 'x' ? value : (attrs?.x ?? this.x);
          const y = key === 'y' ? value : (attrs?.y ?? this.y);
          this.position.set(x, y);
        } else if (key === 'width' || key === 'height') {
          const width = key === 'width' ? value : (attrs?.width ?? this.width);
          const height =
            key === 'height' ? value : (attrs?.height ?? this.height);
          this.setSize(width, height);
        } else {
          this._updateProperty(key, value, mergeStrategy);
        }
      }
    }

    _updateProperty(key, value, mergeStrategy) {
      deepMerge(this, { [key]: value }, { mergeStrategy });
    }
  };
};
