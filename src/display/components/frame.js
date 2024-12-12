import { NineSliceSprite } from 'pixi.js';
import { getAsset } from '../../assets/asset';

export const frame = (
  assetName,
  { width = 40, height = 40, x = 0, y = 0, parent },
) => {
  if (!assetName) return;
  const texture = getAsset(assetName);
  const frame = new NineSliceSprite({
    texture,
    leftWidth: texture.metadata.leftWidth,
    topHeight: texture.metadata.topHeight,
    rightWidth: texture.metadata.rightWidth,
    bottomHeight: texture.metadata.bottomHeight,
    width: width + texture.borderWidth,
    height: height + texture.borderWidth,
  });
  const borderWidth = texture.borderWidth ? texture.borderWidth / 2 : 0;
  frame.position.set(x - borderWidth, y - borderWidth);
  if (parent) parent.addChild(frame);
  return frame;
};
