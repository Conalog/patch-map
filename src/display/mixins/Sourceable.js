import { Assets, Texture } from 'pixi.js';
import { getTexture } from '../../assets/textures/texture';
import { UPDATE_STAGES } from './constants';

const KEYS = ['source'];

export const Sourceable = (superClass) => {
  const MixedClass = class extends superClass {
    constructor(...args) {
      super(...args);
      this._loadToken = 0;
    }

    _applySource(relevantChanges) {
      const { source } = relevantChanges;
      const { viewport, theme } = this.store;
      const currentToken = ++this._loadToken;

      if (!source) {
        this._setTexture(Texture.EMPTY);
        return;
      }

      let texture = null;
      try {
        texture = getTexture(viewport.app.renderer, theme, source);
      } catch {
        // Ignore sync lookup failures and fall back to asset loading.
      }

      if (texture) {
        this._setTexture(texture);
        return;
      }

      if (typeof source !== 'string') {
        this._setTexture(Texture.EMPTY);
        return;
      }

      Assets.load(source)
        .then((loadedTexture) => {
          if (!this.destroyed && currentToken === this._loadToken) {
            this._setTexture(loadedTexture);
          }
        })
        .catch((err) => {
          console.warn('[patchmap:source] failed to load', source, err);
          if (!this.destroyed && currentToken === this._loadToken) {
            this._setTexture(Texture.EMPTY);
          }
        });
    }

    _setTexture(texture) {
      if (this.destroyed) return;

      const metadata = texture?.metadata?.slice ?? {};
      if (this.sprite) {
        if (this.sprite.destroyed) return;
        this.sprite.texture = texture;
      } else {
        Object.assign(this, { texture, ...metadata });
      }

      // Allow mixins to react after a texture is applied.
      if (typeof this._onTextureApplied === 'function') {
        this._onTextureApplied(texture);
      }
      this.store?.viewport?.emit?.('object_transformed', this);
    }
  };
  MixedClass.registerHandler(
    KEYS,
    MixedClass.prototype._applySource,
    UPDATE_STAGES.RENDER,
  );
  return MixedClass;
};
