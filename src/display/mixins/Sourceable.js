import { getTexture } from '../../assets/textures/texture';
import { UPDATE_STAGES } from './constants';

const KEYS = ['source'];

export const Sourceable = (superClass) => {
  const MixedClass = class extends superClass {
    _applySource(relevantChanges) {
      const { source } = relevantChanges;
      const { viewport, theme } = this.context;
      const texture = getTexture(viewport.app.renderer, theme, source);
      this.texture = texture;
    }
  };
  MixedClass.registerHandler(
    KEYS,
    MixedClass.prototype._applySource,
    UPDATE_STAGES.RENDER,
  );
  return MixedClass;
};
