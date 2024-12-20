import { NineSliceSprite } from 'pixi.js';
import { getAsset } from '../../assets/utils';
import { getNestedValue, getPadding } from '../../utils/get';
import { deepMerge } from '../../utils/merge';
import { BAR_COMPONENT_CONFIG } from './config';

export const barComponent = (name, frame, theme, opts = {}) => {
  const options = deepMerge(BAR_COMPONENT_CONFIG, opts);

  const texture = getAsset(`bars-${name}`);
  if (!texture) {
    console.warn(`${name}에 해당하는 aaset이 존재하지 않습니다.`);
    return;
  }

  const metadata = {
    max: getBarMaxSize(frame),
    percentWidth: options.percentWidth,
    percentHeight: Math.max(options.minPercentHeight, options.percentHeight),
  };
  const width = metadata.max.width * metadata.percentWidth;
  const height = metadata.max.height * metadata.percentHeight;

  const bar = new NineSliceSprite({
    texture,
    ...texture.metadata.slice,
    width,
    height,
  });
  setBarPosition(frame, bar);
  bar.type = 'bar';
  bar.label = options.label;
  bar.zIndex = options.zIndex;
  if (options.tint || options.color) {
    const tint = options.tint ?? getNestedValue(theme, options.color);
    if (tint) bar.tint = tint;
  }
  bar.eventMode = 'none';
  bar.metadata = metadata;
  if (options.parent) {
    options.parent.addChild(bar);
  }
  bar.option = {
    name,
    color: options.color,
    zIndex: options.zIndex,
    minPercentHeight: options.minPercentHeight,
  };
  return bar;
};

const getBarMaxSize = (frame) => {
  const padding = getPadding(frame.texture.metadata.padding);
  return {
    width: frame.width - padding.left - padding.right,
    height: frame.height - padding.top - padding.bottom,
  };
};

const setBarPosition = (frame, bar) => {
  const padding = getPadding(frame.texture.metadata.padding);
  const x = frame.x + padding.left;
  const y = frame.y + frame.height - bar.height - padding.bottom;
  bar.position.set(x, y);
};
