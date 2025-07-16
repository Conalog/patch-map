import { UPDATE_STAGES } from './constants';
import { tweensOf } from './utils';

const KEYS = ['animation'];

export const Animationable = (superClass) => {
  const MixedClass = class extends superClass {
    constructor(options) {
      super(options);
      this.tweens = [];
    }

    _applyAnimation(relevantChanges) {
      const { animation } = relevantChanges;
      if (!animation) {
        tweensOf(this).forEach((tween) => tween.progress(1).kill());
      }
    }

    tweensKill() {
      this.tweens.forEach((tween) => tween.kill());
      this.tweens = [];
    }
  };
  MixedClass.registerHandler(
    KEYS,
    MixedClass.prototype._applyAnimation,
    UPDATE_STAGES.ANIMATION,
  );
  return MixedClass;
};
