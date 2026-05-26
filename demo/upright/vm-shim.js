export class Script {
  constructor(source) {
    this.source = source;
  }

  runInNewContext(context = {}) {
    const keys = Object.keys(context);
    const values = keys.map((key) => context[key]);
    return Function(
      ...keys,
      `"use strict"; return (${this.source});`,
    )(...values);
  }
}

export default { Script };
