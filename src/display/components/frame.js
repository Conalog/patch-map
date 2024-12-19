import { NineSliceSprite } from 'pixi.js';
import { getAsset } from '../../assets/utils';
import { deepMerge } from '../../utils/merge';
import { getBorderPadding } from '../utils';
import { FRAME_COMPONENT_CONFIG } from './config';

export const frameComponent = (name, opts = {}) => {
  const options = deepMerge(FRAME_COMPONENT_CONFIG, opts);

  const texture = getAsset(`frames-${name}`);
  if (!texture) {
    console.warn(`${name}에 해당하는 aaset이 존재하지 않습니다.`);
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
  frame.type = 'frame';
  frame.label = options.label;
  frame.metadata = {
    x: options.x,
    y: options.y,
    width: options.width ?? textureMetadata.defaultWidth,
    height: options.height ?? textureMetadata.defaultHeight,
  };
  frame.components = {};
  const borderWidth = getBorderPadding(textureMetadata.borderWidth);
  frame.position.set(options.x - borderWidth, options.y - borderWidth);
  if (options.parent) {
    options.parent.addChild(frame);
  }
  frame.option = {
    name,
  };
  return frame;
};
