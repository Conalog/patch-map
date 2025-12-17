import { collectCandidates } from '../../utils/get';
import { Command } from './base';

export class UpdateCommand extends Command {
  constructor(element, changes, options) {
    super(options.historyId);

    this.element = element;
    this.elementId = element.id;

    this.parent = element.parent;
    this.context = element.context;

    this.changes = changes;
    this.options = options;
    this.previousProps = this._createPreviousState(this.changes);
  }

  execute() {
    const element = this._resolveElement(false);
    if (!element) return;

    element.apply(this.changes, { ...this.options, historyId: false });
  }

  undo() {
    const element = this._resolveElement(true);
    if (!element) return;

    element.apply(this.previousProps, {
      ...this.options,
      mergeStrategy: 'replace',
      historyId: false,
    });
  }

  _resolveElement(isUndo) {
    if (this.element && !this.element.destroyed) {
      return this.element;
    }

    const targetId =
      isUndo && this.changes?.id ? this.changes.id : this.elementId;
    if (this.parent && !this.parent.destroyed) {
      const candidates = collectCandidates(
        this.parent,
        (node) => node.id === targetId,
      );
      if (candidates[0]) {
        this.element = candidates[0];
        return candidates[0];
      }
    }

    if (this.context?.viewport && !this.context.viewport.destroyed) {
      const candidates = collectCandidates(
        this.context.viewport,
        (node) => node.id === targetId,
      );
      if (candidates[0]) {
        this.element = candidates[0];
        this.parent = this.element.parent;
        return candidates[0];
      }
    }

    console.debug(`UpdateCommand: Element with ID ${targetId} not found`);
    return null;
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
