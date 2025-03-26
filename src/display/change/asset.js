import { getTexture } from '../../assets/textures/texture';
import { isConfigMatch, updateConfig } from './utils';

export const changeAsset = (object, { asset: assetConfig }) => {
  if (isConfigMatch(object, 'asset', assetConfig)) {
    return;
  }

  const asset = getTexture(assetConfig);
  object.texture = asset ?? null;
  updateConfig(object, { asset: assetConfig });
};
