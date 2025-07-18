import { Command } from './base';

export class UpdateCommand extends Command {
  constructor(element, changes, options) {
    super(options.historyId);
    this.element = element;
    this.changes = changes;
    this.options = options;
    this.inverseChanges = this._createInversePatch(changes);
  }

  execute() {
    this.element.update(this.changes, {
      ...this.options,
      historyId: false,
    });
  }

  undo() {
    this.element.update(this.inverseChanges, {
      ...this.options,
      historyId: false,
    });
  }

  _createInversePatch(changes) {
    const inverse = {};
    const currentProps = this.element.props;

    for (const key in changes) {
      if (key === 'attrs') {
        inverse.attrs = {};
        for (const attrKey in changes.attrs) {
          if (this.element[attrKey] !== undefined) {
            inverse.attrs[attrKey] = this._deepClone(this.element[attrKey]);
          } else {
            inverse.attrs[attrKey] = this._deepClone(
              currentProps.attrs?.[attrKey],
            );
          }
        }
      } else {
        inverse[key] = this._deepClone(currentProps[key]);
      }
    }
    return inverse;
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
