import { NineSliceSprite } from 'pixi.js';
import { getAsset } from '../../assets/asset';
import { getPadding } from '../../utils/get';
import { findComponents } from '../../utils/find';
import { deepMerge } from '../../utils/merge';

export const barComponent = (
  assetName,
  {
    id = null,
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
    let width = null;
    let height = null;

    const metadata = {
      ...getBarMaxSize(frame),
      percentWidth,
      percentHeight,
    };
    width = metadata.width * percentWidth;
    height = metadata.height * percentHeight;

    const bar = new NineSliceSprite({
      texture,
      leftWidth: texture.metadata.leftWidth,
      topHeight: texture.metadata.topHeight,
      rightWidth: texture.metadata.rightWidth,
      bottomHeight: texture.metadata.bottomHeight,
      width: width,
      height: height,
    });
    setBarPosition(frame, bar);
    bar.assetName = 'bar';
    bar.label = id;
    bar.zIndex = zIndex;
    bar.tint = color;
    bar.eventMode = 'none';
    bar.metadata = metadata;
    if (parent) parent.addChild(bar);
    return bar;
  } catch (e) {
    console.error(e);
    throw e;
  }
};

const getBarMaxSize = (frame) => {
  const padding = getPadding(frame.texture.metadata.padding);
  return {
    width: frame.width - padding.left - padding.right,
    height: frame.height - padding.top - padding.bottom,
  };
};

export const updateBarComponent = (frame, options = {}) => {
  const { percentWidth, percentHeight, color } = deepMerge(
    { percentWidth: 1, percentHeight: 1, color: null },
    options,
  );

  const { bar } = findComponents(frame.label, [frame.parent]);
  bar.metadata = {
    ...bar.metadata,
    ...getBarMaxSize(frame),
    percentWidth,
    percentHeight,
  };

  const barMinHeight =
    bar.texture.metadata.topHeight + bar.texture.metadata.bottomHeight;
  bar.setSize(
    bar.metadata.width * percentWidth,
    Math.max(barMinHeight, bar.metadata.height * percentHeight),
  );
  setBarPosition(frame, bar);

  if (color) bar.tint = color;
};

const setBarPosition = (frame, bar) => {
  const padding = getPadding(frame.texture.metadata.padding);
  const x = frame.x + padding.left;
  const y = frame.y + frame.height - bar.height - padding.bottom;

  bar.position.set(x, y);
};
