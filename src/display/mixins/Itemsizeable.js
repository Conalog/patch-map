import { UPDATE_STAGES } from './constants';

const KEYS = ['size'];

export const ItemSizeable = (superClass) => {
  const MixedClass = class extends superClass {
    _applyItemSize() {
      for (const child of this.children) {
        child.update(child.props, { overwrite: true });
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
