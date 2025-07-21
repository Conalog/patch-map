import { Command } from './base';

export class UpdateCommand extends Command {
  constructor(element, changes, options) {
    super(options.historyId);
    this.element = element;
    this.changes = changes;
    this.options = options;
    this.previousProps = this._createPreviousState(element.props);
  }

  execute() {
    this.element.update(this.changes, {
      ...this.options,
      historyId: false,
    });
  }

  undo() {
    this.element.update(this.previousProps, {
      mergeStrategy: 'replace',
      historyId: false,
    });
  }

  _createPreviousState(changes) {
    const slice = {};
    const currentProps = this.element.props;

    for (const key in changes) {
      if (Object.prototype.hasOwnProperty.call(currentProps, key)) {
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
      return JSON.parse(JSON.stringify(value));
    } catch (_) {
      return value;
    }
  }
}
