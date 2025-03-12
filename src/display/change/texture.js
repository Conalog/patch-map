import { getTexture } from '../../assets/textures/texture';
import { deepMerge } from '../../utils/deepmerge/deepmerge';
import { isConfigMatch } from './utils';

export const changeTexture = (component, { texture: textureConfig }) => {
  if (isConfigMatch(component, 'texture', textureConfig)) {
    return;
  }

  const texture = getTexture(
    typeof textureConfig === 'string'
      ? textureConfig
      : deepMerge(component.texture.metadata.config, textureConfig),
  );
  component.texture = texture ?? null;
};
