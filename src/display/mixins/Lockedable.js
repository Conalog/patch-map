const KEYS = ['locked'];
const DEFAULT_UNLOCKED_EVENT_MODE = 'static';

export const Lockedable = (superClass) => {
  const MixedClass = class extends superClass {
    constructor(options = {}) {
      super(options);
      this.eventMode = DEFAULT_UNLOCKED_EVENT_MODE;
    }

    _applyLocked({ locked }) {
      if (typeof locked !== 'boolean') {
        return;
      }

      this.eventMode = locked ? 'none' : DEFAULT_UNLOCKED_EVENT_MODE;
      this.store?.viewport?.emit('object_transformed', this);
    }
  };

  MixedClass.registerHandler(KEYS, MixedClass.prototype._applyLocked);
  return MixedClass;
};
