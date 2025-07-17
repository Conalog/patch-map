import { Matrix } from 'pixi.js';
import { isValidationError } from 'zod-validation-error';
import { deepMerge } from '../../utils/deepmerge/deepmerge';
import { diffJson } from '../../utils/diff/diff-json';
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
      this.onRender = this._onObjectUpdate;
    }

    get context() {
      return this.#context;
    }

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
      if (!Object.prototype.hasOwnProperty.call(this, '_handlerRegistry')) {
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
      const { arrayMerge = 'merge', refresh = false } = options;
      const effectiveChanges = refresh && !changes ? {} : changes;
      const validatedChanges = validate(effectiveChanges, deepPartial(schema));
      if (isValidationError(validatedChanges)) throw validatedChanges;

      const prevProps = JSON.parse(JSON.stringify(this.props));
      this.props = deepMerge(prevProps, validatedChanges, { arrayMerge });

      const keysToProcess = refresh
        ? Object.keys(this.props)
        : Object.keys(diffJson(prevProps, this.props) ?? {});

      const { id, label, attrs } = validatedChanges;
      if (id || label || attrs) {
        this._applyRaw({ id, label, ...attrs }, arrayMerge);
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
          if (Object.prototype.hasOwnProperty.call(this.props, key)) {
            fullPayload[key] = this.props[key];
          }
        });
        handler.call(this, fullPayload, { arrayMerge, refresh });
      });

      if (this.parent?._onChildUpdate) {
        this.parent._onChildUpdate(
          this.id,
          diffJson(prevProps, this.props),
          arrayMerge,
        );
      }
    }

    _applyRaw(attrs, arrayMerge) {
      for (const [key, value] of Object.entries(attrs)) {
        if (value === undefined) continue;

        if (key === 'x' || key === 'y') {
          const x = key === 'x' ? value : (attrs?.x ?? this.x);
          const y = key === 'y' ? value : (attrs?.y ?? this.y);
          this.position.set(x, y);
        } else if (key === 'width' || key === 'height') {
          const width = key === 'width' ? value : (attrs?.width ?? this.width);
          const height =
            key === 'height' ? value : (attrs?.height ?? this.height);
          this.setSize(width, height);
        } else {
          this._updateProperty(key, value, arrayMerge);
        }
      }
    }

    _updateProperty(key, value, arrayMerge) {
      deepMerge(this, { [key]: value }, { arrayMerge });
    }
  };
};
