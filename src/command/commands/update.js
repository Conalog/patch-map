import { Command } from './base';

export class UpdateCommand extends Command {
  constructor(element, changes, options) {
    super(options.historyId);
    this.element = element;
    this.changes = changes;
    this.options = options;
    this.previousProps = this._createPreviousState(this.changes);
  }

  execute() {
    this.element.update(this.changes, {
      ...this.options,
      historyId: false,
    });
  }

  undo() {
    this.element.update(this.previousProps, {
      ...this.options,
      mergeStrategy: 'replace',
      historyId: false,
    });
  }

  _createPreviousState(changes) {
    const slice = {};
    if (!changes) {
      return slice;
    }
    const currentProps = this.element.props;

    for (const key of Object.keys(changes)) {
      if (
        key === 'attrs' &&
        changes.attrs !== null &&
        typeof changes.attrs === 'object'
      ) {
        const prevAttrs = {};
        for (const attrKey of Object.keys(changes.attrs)) {
          prevAttrs[attrKey] = this._deepClone(this.element[attrKey]);
        }
        slice.attrs = prevAttrs;
      } else {
        slice[key] = this._deepClone(currentProps[key]);
      }
    }
    return slice;
  }

  _deepClone(value) {
    if (value && typeof value.clone === 'function') {
      return value.clone();
    }
    try {
      return structuredClone(value);
    } catch (_) {
      return value;
    }
  }
}
