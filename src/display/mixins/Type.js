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
