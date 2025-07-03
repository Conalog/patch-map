import { isValidationError } from 'zod-validation-error';
import { validate } from '../utils/validator';
import { deepPartial } from '../utils/zod-deep-strict-partial';
import { changeProperty } from './change';

const EXCEPTION_KEYS = new Set(['type', 'children']);

export const Type = (superClass) => {
  return class extends superClass {
    #type;

    constructor(options = {}) {
      const { type = null, ...rest } = options;
      super(rest);
      this.#type = type;
    }

    get type() {
      return this.#type;
    }
  };
};

export const Context = (superClass) => {
  return class extends superClass {
    #context;

    constructor(options = {}) {
      const { context = null, ...rest } = options;
      super(rest);
      this.#context = context;
    }

    get context() {
      return this.#context;
    }
  };
};

export const Base = (superClass) => {
  return class extends Context(Type(superClass)) {
    get show() {
      return this.renderable;
    }

    set show(value) {
      this.renderable = value;
    }

    update(changes, schema) {
      const validated = validate(changes, deepPartial(schema));
      if (isValidationError(validated)) throw validated;

      const { attrs = null, ...restChanges } = changes;

      if (attrs) {
        for (const [key, value] of Object.entries(attrs)) {
          if (key === 'x' || key === 'y') {
            const x = key === 'x' ? value : (attrs?.x ?? this.x);
            const y = key === 'y' ? value : (attrs?.y ?? this.y);
            this.position.set(x, y);
            continue;
          }

          if (key === 'width' || key === 'height') {
            const width =
              key === 'width' ? value : (attrs?.width ?? this.width);
            const height =
              key === 'height' ? value : (attrs?.height ?? this.height);
            this.setSize(width, height);
            continue;
          }
          changeProperty(this, key, value);
        }
      }

      for (const [key, value] of Object.entries(restChanges)) {
        if (!EXCEPTION_KEYS.has(key)) {
          changeProperty(this, key, value);
        }
      }
    }
  };
};
