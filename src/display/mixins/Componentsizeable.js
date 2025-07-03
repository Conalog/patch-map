import { UPDATE_STAGES } from './constants';
import { calcSize } from './utils';

const KEYS = ['source', 'size', 'margin'];

export const ComponentSizeable = (superClass) => {
  const MixedClass = class extends superClass {
    _applyComponentSize(relevantChanges) {
      const { source, size, margin } = relevantChanges;
      const newSize = calcSize(this, { source, size, margin });
      this.setSize(newSize.width, newSize.height);
      this.position.set(-newSize.borderWidth / 2);
    }
  };
  MixedClass.registerHandler(
    KEYS,
    MixedClass.prototype._applyComponentSize,
    UPDATE_STAGES.SIZE,
  );
  return MixedClass;
};
