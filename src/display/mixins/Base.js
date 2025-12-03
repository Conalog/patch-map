import { Matrix } from 'pixi.js';
import { isValidationError } from 'zod-validation-error';
import { UpdateCommand } from '../../command/commands/update';
import { deepMerge } from '../../utils/deepmerge/deepmerge';
import { diffReplace } from '../../utils/diff/diff-replace';
import { validate } from '../../utils/validator';
import { deepPartial } from '../../utils/zod-deep-strict-partial';
import { Type } from './Type';

const tempMatrix = new Matrix();

export const Base = (superClass) => {
  return class extends Type(superClass) {
    static _handlerMap = new Map();
    static _handlerRegistry = new Map();
    #context;

    constructor(options = {}) {
      const { context = null, ...rest } = options;
      super(rest);
      this.#context = context;
      this.props = {};

      this._lastLocalTransform = tempMatrix.clone();
      this.onRender = () => {
        this._onObjectUpdate();
        this._afterRender();
      };
    }

    get context() {
      return this.#context;
    }

    _afterRender() {}

    _onObjectUpdate() {
      if (!this.localTransform || !this.visible) return;

      if (!this.localTransform.equals(this._lastLocalTransform)) {
        this.context.viewport.emit('object_transformed', this);
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
      }

      const registration = this._handlerRegistry.get(handler) ?? {
        keys: new Set(),
        stage: stage ?? 99,
      };
      keys.forEach((key) => registration.keys.add(key));
      this._handlerRegistry.set(handler, registration);
      registration.keys.forEach((key) => {
        if (!this._handlerMap.has(key)) this._handlerMap.set(key, new Set());
        this._handlerMap.get(key).add(handler);
      });
    }

    update(changes, schema, options = {}) {
      const { mergeStrategy = 'merge', refresh = false } = options;
      const effectiveChanges = refresh && !changes ? {} : changes;
      const validatedChanges = validate(effectiveChanges, deepPartial(schema));
      if (isValidationError(validatedChanges)) throw validatedChanges;

      const nextProps =
        mergeStrategy === 'replace'
          ? validate({ ...this.props, ...validatedChanges }, schema)
          : deepMerge(this.props, validatedChanges);
      if (isValidationError(nextProps)) throw nextProps;
      const actualChanges = diffReplace(this.props, nextProps) ?? {};

      if (options?.historyId && Object.keys(actualChanges).length > 0) {
        const command = new UpdateCommand(this, changes, options);
        this.context.undoRedoManager.execute(command, options);
        return;
      }

      this.props = nextProps;
      const keysToProcess = refresh
        ? Object.keys(nextProps)
        : Object.keys(actualChanges);

      const { id, label, attrs } = validatedChanges;
      if (id || label || attrs) {
        this._applyRaw({ id, label, ...attrs }, mergeStrategy);
      }

      const tasks = new Map();
      for (const key of keysToProcess) {
        const handlers = this.constructor._handlerMap.get(key);
        if (handlers) {
          handlers.forEach((handler) => {
            if (!tasks.has(handler)) {
              const { stage } = this.constructor._handlerRegistry.get(handler);
              tasks.set(handler, { stage });
            }
          });
        }
      }

      const sortedTasks = [...tasks.entries()].sort(
        (a, b) => a[1].stage - b[1].stage,
      );
      sortedTasks.forEach(([handler, _]) => {
        const keysForHandler =
          this.constructor._handlerRegistry.get(handler).keys;
        const fullPayload = {};
        keysForHandler.forEach((key) => {
          if (Object.hasOwn(this.props, key)) {
            fullPayload[key] = this.props[key];
          }
        });
        handler.call(this, fullPayload, { mergeStrategy, refresh });
      });

      if (this.parent?._onChildUpdate) {
        this.parent._onChildUpdate(this.id, actualChanges, mergeStrategy);
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
