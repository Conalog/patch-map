import { NineSliceSprite } from 'pixi.js';
import { getAsset } from '../../assets/utils';
import { getFrameInnerSize, getNestedValue, getPadding } from '../../utils/get';
import { deepMerge } from '../../utils/merge';
import { BAR_COMPONENT_CONFIG } from './config';

export const barComponent = (name, theme, opts = {}) => {
  const options = deepMerge(BAR_COMPONENT_CONFIG, opts);

  if (!opts.frame) throw 'The frame option is missing.';

  const texture = getAsset(`bars-${name}`);
  if (!texture) {
    console.warn(`No asset exists for ${name}.`);
    return;
  }

  const percentWidth = options.percentWidth;
  const percentHeight = Math.max(
    options.minPercentHeight,
    options.percentHeight,
  );
  const maxSize = getFrameInnerSize(options.frame);
  const width = maxSize.width * percentWidth;
  const height = maxSize.height * percentHeight;

  const bar = new NineSliceSprite({
    texture,
    ...texture.metadata.slice,
    width,
    height,
  });
  setBarPosition(options.frame, bar);
  bar.type = 'bar';
  bar.label = options.label;
  bar.zIndex = options.zIndex;
  bar.renderable = options.show ?? false;
  if (options.color) {
    bar.tint = options.color.startsWith('#')
      ? options.color
      : getNestedValue(theme, options.color);
  }
  bar.eventMode = 'none';
  if (options.parent) {
    options.parent.addChild(bar);
  }
  bar.frame = options.frame;
  bar.option = {
    name,
    show: bar.renderable,
    color: options.color,
    zIndex: options.zIndex,
    minPercentHeight: options.minPercentHeight,
    percentWidth,
    percentHeight,
  };
  options.frame.components[bar.type] = bar;
  return bar;
};

const setBarPosition = (frame, bar) => {
  const padding = getPadding(frame.texture.metadata.padding);
  const x = frame.x + padding.left;
  const y = frame.y + frame.height - bar.height - padding.bottom;
  bar.position.set(x, y);
};
