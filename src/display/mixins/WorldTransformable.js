import { applyWorldFlip } from '../utils/world-flip';
import { applyWorldRotation } from '../utils/world-rotation';
import { UPDATE_STAGES } from './constants';

export const WorldTransformable = (superClass) => {
  const MixedClass = class extends superClass {
    _applyWorldTransform() {
      if (!this.store?.view) return;

      const options = this.constructor.worldRotationOptions || {};
      applyWorldRotation(this, this.store.view, options);
      applyWorldFlip(this, this.store.view);
    }
  };

  if (superClass.worldTransformKeys) {
    MixedClass.registerHandler(
      superClass.worldTransformKeys,
      MixedClass.prototype._applyWorldTransform,
      UPDATE_STAGES.WORLD_TRANSFORM,
    );
  }

  return MixedClass;
};
