const types = new WeakMap();

export const Type = (superClass) => {
  return class extends superClass {
    constructor(options = {}) {
      const { type = null, ...rest } = options;
      super(rest);
      types.set(this, type);
    }

    get type() {
      return types.get(this);
    }
  };
};
