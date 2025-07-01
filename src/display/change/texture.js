import { getTexture } from '../../assets/textures/texture';
import { deepMerge } from '../../utils/deepmerge/deepmerge';
import { getViewport } from '../../utils/get';
import { isMatch, mergeProps } from './utils';

export const changeTexture = (object, { source: textureConfig }, { theme }) => {
  if (isMatch(object, { source: textureConfig })) {
    return;
  }

  const renderer = getViewport(object).app.renderer;
  const texture = getTexture(
    renderer,
    theme,
    deepMerge(object.texture?.metadata?.config, textureConfig),
  );
  object.texture = texture ?? null;
  Object.assign(object, { ...texture.metadata.slice });
  mergeProps(object, { source: textureConfig });
};
