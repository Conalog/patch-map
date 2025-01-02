import { NineSliceSprite } from 'pixi.js';
import { getAsset } from '../../assets/utils';
import { getBorderPadding } from '../../utils/get';
import { deepMerge } from '../../utils/merge';
import { FRAME_COMPONENT_CONFIG } from './config';

export const frameComponent = (name, opts = {}) => {
  const options = deepMerge(FRAME_COMPONENT_CONFIG, opts);

  const texture = getAsset(`frames-${name}`);
  if (!texture) {
    console.warn(`No asset exists for ${name}.`);
    return;
  }

  const textureMetadata = texture.metadata;

  const frame = new NineSliceSprite({
    texture,
    ...textureMetadata.slice,
    width:
      (options.width ?? textureMetadata.defaultWidth) +
      textureMetadata.borderWidth,
    height:
      (options.height ?? textureMetadata.defaultHeight) +
      textureMetadata.borderWidth,
  });
  frame.id = options.id;
  frame.type = 'frame';
  frame.label = options.label;
  frame.interactive = true;
  frame._props = {
    x: options.x ?? 0,
    y: options.y ?? 0,
    width: options.width ?? textureMetadata.defaultWidth,
    height: options.height ?? textureMetadata.defaultHeight,
  };
  const borderWidth = getBorderPadding(textureMetadata.borderWidth);
  frame.position.set(options.x - borderWidth, options.y - borderWidth);
  if (options.parent) {
    options.parent.addChild(frame);
  }
  frame.components = {};
  frame.option = {
    name,
  };
  return frame;
};
