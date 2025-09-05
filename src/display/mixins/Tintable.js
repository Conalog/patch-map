import { getColor } from '../../utils/get';
import { UPDATE_STAGES } from './constants';

const KEYS = ['tint'];

export const Tintable = (superClass) => {
  const MixedClass = class extends superClass {
    _applyTint(relevantChanges) {
      const { tint } = relevantChanges;
      this.tint = getColor(this.context.theme, tint);
    }
  };
  MixedClass.registerHandler(
    KEYS,
    MixedClass.prototype._applyTint,
    UPDATE_STAGES.VISUAL,
  );
  return MixedClass;
};
