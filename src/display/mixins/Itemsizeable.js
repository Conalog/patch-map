import { UPDATE_STAGES } from './constants';

const KEYS = ['size'];

export const ItemSizeable = (superClass) => {
  const MixedClass = class extends superClass {
    _applyItemSize() {
      for (const child of this.children) {
        if ('size' in child.props) {
          child.update({ size: child.props.size }, { overwrite: true });
        } else if ('text' in child.props) {
          child.update({ text: child.props.text }, { overwrite: true });
        }
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
