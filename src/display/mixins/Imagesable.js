import { Assets, Sprite, Texture } from 'pixi.js';
import { UPDATE_STAGES } from './constants';

export const Imagesable = (superClass) => {
  const MixedClass = class extends superClass {
    _initSprite() {
      if (this.sprite) return;
      this.sprite = new Sprite(Texture.EMPTY);
      this.addChild(this.sprite);
      this._loadToken = 0;
    }

    async _handleSource({ source }) {
      this._initSprite();
      if (!source) {
        this.sprite.texture = Texture.EMPTY;
        return;
      }

      const currentToken = ++this._loadToken;

      try {
        if (Assets.cache.has(source)) {
          const texture = Assets.get(source);
          if (currentToken === this._loadToken) {
            this.sprite.texture = texture;
            this._applyImageSize();
          }
          return;
        }

        const texture = await Assets.load(source);
        if (currentToken === this._loadToken) {
          this.sprite.texture = texture;
          this._applyImageSize();
        }
      } catch (err) {
        console.warn('[patchmap:image] failed to load', source, err);
        if (currentToken === this._loadToken) {
          this.sprite.texture = Texture.EMPTY;
        }
      }
    }

    _handleImageSize() {
      this._initSprite();
      this._applyImageSize();
    }

    _applyImageSize() {
      const { size } = this.props;
      if (!size || !this.sprite) return;

      if (size.width !== undefined) this.sprite.width = size.width;
      if (size.height !== undefined) this.sprite.height = size.height;
    }
  };

  MixedClass.registerHandler(
    ['source'],
    MixedClass.prototype._handleSource,
    UPDATE_STAGES.RENDER,
  );
  MixedClass.registerHandler(
    ['size'],
    MixedClass.prototype._handleImageSize,
    UPDATE_STAGES.SIZE,
  );

  return MixedClass;
};
