import { UPDATE_STAGES } from './constants';

const KEYS = ['show'];

export const Showable = (superClass) => {
  const MixedClass = class extends superClass {
    _applyShow(relevantChanges) {
      const { show } = relevantChanges;
      this.renderable = show;
    }
  };
  MixedClass.registerHandler(
    KEYS,
    MixedClass.prototype._applyShow,
    UPDATE_STAGES.RENDER,
  );
  return MixedClass;
};
