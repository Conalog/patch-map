export default class Tool {
  #context = null;

  constructor(context) {
    this.#context = context;
  }

  get context() {
    return this.#context;
  }

  activate() {
    throw new Error('The activate() method must be implemented.');
  }

  deactivate() {
    throw new Error('The deactivate() method must be implemented.');
  }
}
