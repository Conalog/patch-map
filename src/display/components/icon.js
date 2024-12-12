import { Sprite } from 'pixi.js';
import { getAsset } from '../../assets/asset';

export const icon = (
  assetName,
  { width = 24, height = 24, x = 0, y = 0, parent = null },
) => {
  if (!assetName) return;
  const texture = getAsset(assetName);
  const icon = new Sprite(texture);
  icon.position.set(x, y);
  icon.setSize(width, height);
  if (parent) parent.addChild(icon);
  return icon;
};
