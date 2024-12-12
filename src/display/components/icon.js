import { Sprite } from 'pixi.js';
import { getAsset } from '../../assets/asset';
import { findCenterPoint } from '../utils';

export const iconComponent = (
  assetName,
  {
    x = 0,
    y = 0,
    parent = null,
    size = 16,
    color = '#1A1A1A',
    frame = null,
    zIndex = 0,
  },
) => {
  if (!assetName) {
    console.warn('변수 assetName이 전달되지 않았습니다.');
    return;
  }
  const texture = getAsset(`icons-${assetName}`);
  if (!texture) {
    console.warn(`${texture}에 해당하는 aaset이 존재하지 않습니다.`);
    return;
  }
  try {
    const icon = new Sprite(texture);
    if (frame) {
      const centerPoint = findCenterPoint(frame);
      icon.anchor.set(0.5);
      icon.position.set(centerPoint.x, centerPoint.y);
    } else {
      icon.anchor.set(1);
      icon.position.set(x, y);
    }
    icon.setSize(size);
    icon.zIndex = zIndex;
    icon.tint = color;
    if (parent) parent.addChild(icon);
    return icon;
  } catch (e) {
    console.error(e);
    throw e;
  }
};
