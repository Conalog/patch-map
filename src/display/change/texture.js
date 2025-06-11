import { getTexture } from '../../assets/textures/texture';
import { deepMerge } from '../../utils/deepmerge/deepmerge';
import { getViewport } from '../../utils/get';
import { isConfigMatch, updateConfig } from './utils';

export const changeTexture = (object, { texture: textureConfig }) => {
  if (isConfigMatch(object, 'texture', textureConfig)) {
    return;
  }

  const renderer = getViewport(object).app.renderer;
  const texture = getTexture(
    renderer,
    deepMerge(object.texture?.metadata?.config, textureConfig),
  );
  object.texture = texture ?? null;
  Object.assign(object, { ...texture.metadata.slice });
  updateConfig(object, { texture: textureConfig });
};
