import { NineSliceSprite } from 'pixi.js';
import { getAsset } from '../../assets/asset';

export const frameComponent = (
  assetName,
  { width = null, height = null, x = 0, y = 0, parent },
) => {
  if (!assetName) {
    console.warn('변수 assetName이 전달되지 않았습니다.');
    return;
  }
  const texture = getAsset(`frames-${assetName}`);
  if (!texture) {
    console.warn(`${texture}에 해당하는 aaset이 존재하지 않습니다.`);
    return;
  }
  try {
    const metadata = texture.metadata;
    const frame = new NineSliceSprite({
      texture,
      leftWidth: metadata.leftWidth,
      topHeight: metadata.topHeight,
      rightWidth: metadata.rightWidth,
      bottomHeight: metadata.bottomHeight,
      width: (width ?? metadata.defaultWidth) + texture.borderWidth,
      height: (height ?? metadata.defaultHeight) + texture.borderWidth,
    });
    frame.metadata = metadata;
    const borderWidth = texture.borderWidth ? texture.borderWidth / 2 : 0;
    frame.position.set(x - borderWidth, y - borderWidth);
    if (parent) parent.addChild(frame);
    return frame;
  } catch (e) {
    console.error(e);
    throw e;
  }
};
