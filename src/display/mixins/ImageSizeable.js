import { UPDATE_STAGES } from './constants';

const KEYS = ['size'];

export const ImageSizeable = (superClass) => {
  const MixedClass = class extends superClass {
    _applyImageSize() {
      const { size } = this.props;
      if (!size || this.destroyed || !this.sprite || this.sprite.destroyed) {
        return;
      }

      if (size.width !== undefined) this.sprite.width = size.width;
      if (size.height !== undefined) this.sprite.height = size.height;

      this.store.viewport.emit('object_transformed', this);
    }

    // Sourceable calls this after each texture application.
    _onTextureApplied() {
      this._applyImageSize();
    }
  };

  MixedClass.registerHandler(
    KEYS,
    MixedClass.prototype._applyImageSize,
    UPDATE_STAGES.SIZE,
  );

  return MixedClass;
};
