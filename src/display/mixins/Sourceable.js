import { Assets, Texture } from 'pixi.js';
import { getTexture } from '../../assets/textures/texture';
import { UPDATE_STAGES } from './constants';

const KEYS = ['source'];

export const Sourceable = (superClass) => {
  const MixedClass = class extends superClass {
    async _applySource(relevantChanges) {
      const { source } = relevantChanges;
      const { viewport, theme } = this.store;

      if (!source) {
        this._setTexture(Texture.EMPTY);
        return;
      }

      // 1. Try synchronous retrieval (cached or predefined textures)
      let texture = null;
      try {
        texture = getTexture(viewport.app.renderer, theme, source);
      } catch {
        // Fallback to async loading
      }

      if (texture) {
        this._setTexture(texture);
        return;
      }

      if (typeof source !== 'string') {
        this._setTexture(Texture.EMPTY);
        return;
      }

      // 2. Asynchronous loading for URLs or unregistered asset keys
      if (this._loadToken === undefined) this._loadToken = 0;
      const currentToken = ++this._loadToken;

      try {
        const loadedTexture = await Assets.load(source);
        if (currentToken === this._loadToken) {
          this._setTexture(loadedTexture);
        }
      } catch (err) {
        console.warn('[patchmap:source] failed to load', source, err);
        if (currentToken === this._loadToken) {
          this._setTexture(Texture.EMPTY);
        }
      }
    }

    _setTexture(texture) {
      const metadata = texture?.metadata?.slice ?? {};
      if (this.sprite) {
        this.sprite.texture = texture;
      } else {
        Object.assign(this, { texture, ...metadata });
      }

      // Hook for post-texture-loading actions
      if (typeof this._onTextureApplied === 'function') {
        this._onTextureApplied(texture);
      }
    }
  };
  MixedClass.registerHandler(
    KEYS,
    MixedClass.prototype._applySource,
    UPDATE_STAGES.RENDER,
  );
  return MixedClass;
};
