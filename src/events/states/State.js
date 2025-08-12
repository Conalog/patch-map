export default class State {
  static handledEvents = [];
  abortController = new AbortController();

  constructor() {
    this.context = null;
  }

  enter(context) {
    this.context = context;
    this.abortController = new AbortController();
  }

  exit() {
    this.abortController.abort();
  }

  pause() {}

  resume() {}
}
