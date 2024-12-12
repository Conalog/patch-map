import { NineSliceSprite } from 'pixi.js';
import { getAsset } from '../../assets/asset';
import { getPadding } from '../utils';

export const barComponent = (
  assetName,
  {
    percentWidth = 1,
    percentHeight = 1,
    parent,
    color = null,
    frame = null,
    zIndex = 0,
  },
) => {
  if (!assetName || !frame) {
    console.warn(
      `변수 ${!assetName ? 'assetName' : 'frame'}이 전달되지 않았습니다.`,
    );
    return;
  }
  const texture = getAsset(`bars-${assetName}`);
  if (!texture) {
    console.warn(`${texture}에 해당하는 aaset이 존재하지 않습니다.`);
    return;
  }
  try {
    const metadata = texture.metadata;

    let width = null;
    let height = null;

    const padding = getPadding(frame.metadata.padding);
    width = (frame.width - padding.left - padding.right) * percentWidth;
    height = (frame.height - padding.top - padding.bottom) * percentHeight;

    const bar = new NineSliceSprite({
      texture,
      leftWidth: metadata.leftWidth,
      topHeight: metadata.topHeight,
      rightWidth: metadata.rightWidth,
      bottomHeight: metadata.bottomHeight,
      width: width,
      height: height,
    });
    setBarPosition(frame, bar);
    bar.zIndex = zIndex;
    bar.tint = color;
    bar.metadata = metadata;
    if (parent) parent.addChild(bar);
    return bar;
  } catch (e) {
    console.error(e);
    throw e;
  }
};

const setBarPosition = (frame, bar) => {
  const padding = getPadding(frame.metadata.padding);
  const x = frame.x + padding.left;
  const y = frame.y + frame.height - bar.height - padding.bottom;
  bar.position.set(x, y);
};
