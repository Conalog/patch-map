const KEYS = ['locked'];

export const Lockedable = (superClass) => {
  const MixedClass = class extends superClass {
    _applyLocked({ locked }) {
      if (typeof locked !== 'boolean') {
        return;
      }

      this.eventMode = locked ? 'none' : 'static';
      this.store?.viewport?.emit('object_transformed', this);
    }
  };

  MixedClass.registerHandler(KEYS, MixedClass.prototype._applyLocked);
  return MixedClass;
};
