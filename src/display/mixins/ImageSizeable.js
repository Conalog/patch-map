import { UPDATE_STAGES } from './constants';

const KEYS = ['size'];

export const ImageSizeable = (superClass) => {
  const MixedClass = class extends superClass {
    _applyImageSize() {
      const { size } = this.props;
      if (!size || !this.sprite) return;

      if (size.width !== undefined) this.sprite.width = size.width;
      if (size.height !== undefined) this.sprite.height = size.height;
    }

    // Hook from Sourceable to ensure size is applied after async texture load
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
