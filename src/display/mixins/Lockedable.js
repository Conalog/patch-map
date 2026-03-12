const KEYS = ['locked'];
const DEFAULT_UNLOCKED_EVENT_MODE = 'static';

const getUnlockedEventMode = (instance) =>
  instance?.constructor?.unlockedEventMode ?? DEFAULT_UNLOCKED_EVENT_MODE;

export const Lockedable = (superClass) => {
  const MixedClass = class extends superClass {
    constructor(options = {}) {
      super(options);
      this.eventMode = getUnlockedEventMode(this);
    }

    _applyLocked({ locked }) {
      if (typeof locked !== 'boolean') {
        return;
      }

      this.eventMode = locked ? 'none' : getUnlockedEventMode(this);
      this.store?.viewport?.emit('object_transformed', this);
    }
  };

  MixedClass.registerHandler(KEYS, MixedClass.prototype._applyLocked);
  return MixedClass;
};
