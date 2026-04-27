import { UPDATE_STAGES } from './constants';

const KEYS = ['size', 'padding'];

export const ItemSizeable = (superClass) => {
  const MixedClass = class extends superClass {
    _applyItemSize(_relevantChanges, options = {}) {
      for (const child of this.children) {
        child.apply(undefined, {
          ...options,
          changes: undefined,
          refresh: true,
        });
      }
    }
  };
  MixedClass.registerHandler(
    KEYS,
    MixedClass.prototype._applyItemSize,
    UPDATE_STAGES.SIZE,
  );
  return MixedClass;
};
