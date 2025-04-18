import { getTexture } from '../../assets/textures/texture';
import { deepMerge } from '../../utils/deepmerge/deepmerge';
import { isConfigMatch, updateConfig } from './utils';

export const changeTexture = (object, { texture: textureConfig }) => {
  if (isConfigMatch(object, 'texture', textureConfig)) {
    return;
  }

  const texture = getTexture(
    deepMerge(object.texture?.metadata?.config, textureConfig),
  );
  object.texture = texture ?? null;
  Object.assign(object, { ...texture.metadata.slice });
  updateConfig(object, { texture: textureConfig });
};
