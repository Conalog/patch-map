import { isPlainObject } from 'is-plain-object';
import { Command } from './base';

export class UpdateCommand extends Command {
  constructor(element, nextProps, options) {
    super(options.historyId);
    this.element = element;
    this.prevProps = this._reversePatch(nextProps);
    this.nextProps = nextProps;
    this.options = options;
  }

  execute() {
    this.element.update(this.nextProps, {
      ...this.options,
      refresh: true,
      historyId: false,
    });
  }

  undo() {
    this.element.update(this.prevProps, {
      ...this.options,
      refresh: true,
      historyId: false,
    });
  }

  _reversePatch(changes) {
    const reversePatch = {};

    for (const key in changes) {
      if (!Object.prototype.hasOwnProperty.call(changes, key)) continue;

      const changeValue = changes[key];
      const object = this.element;

      if (key === 'attrs' && isPlainObject(changeValue)) {
        reversePatch.attrs = {};
        for (const attrKey in changeValue) {
          if (object[attrKey] && typeof object[attrKey].clone === 'function') {
            reversePatch.attrs[attrKey] = object[attrKey].clone();
          } else if (object[attrKey] !== undefined) {
            reversePatch.attrs[attrKey] = object[attrKey];
          } else {
            reversePatch.attrs[attrKey] = object.props.attrs?.[attrKey];
          }
        }
      } else {
        reversePatch[key] = object.props[key];
      }
    }
    return reversePatch;
  }
}
