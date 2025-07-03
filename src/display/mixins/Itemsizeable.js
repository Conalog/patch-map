import { deepMerge } from '../../utils/deepmerge/deepmerge';
import { UPDATE_STAGES } from './constants';

const KEYS = ['size'];

export const ItemSizeable = (superClass) => {
  const MixedClass = class extends superClass {
    _applyItemSize(relevantChanges) {
      const { size } = relevantChanges;
      this.props.size = deepMerge(this.props.size, size);
    }
  };
  MixedClass.registerHandler(
    KEYS,
    MixedClass.prototype._applyItemSize,
    UPDATE_STAGES.SIZE,
  );
  return MixedClass;
};
