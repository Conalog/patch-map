import { getTexture } from '../../assets/textures/texture';
import { getViewport } from '../../utils/get';
import { isMatch, mergeProps } from './utils';

export const changeAsset = (object, { source: assetConfig }, { theme }) => {
  if (isMatch(object, { source: assetConfig })) {
    return;
  }

  const renderer = getViewport(object).app.renderer;
  const asset = getTexture(renderer, theme, assetConfig);
  if (!asset) {
    console.warn(`Asset not found for config: ${JSON.stringify(assetConfig)}`);
  }
  object.texture = asset ?? null;
  mergeProps(object, { source: assetConfig });
};
