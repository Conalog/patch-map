import { NineSliceSprite } from 'pixi.js';
import { getAsset } from '../../assets/asset';
import { updateBarComponent } from './bar';

export const frameComponent = (
  assetName,
  { id = null, width = null, height = null, x = 0, y = 0, parent },
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
    const textureMetadata = texture.metadata;
    const frame = new NineSliceSprite({
      texture,
      leftWidth: textureMetadata.leftWidth,
      topHeight: textureMetadata.topHeight,
      rightWidth: textureMetadata.rightWidth,
      bottomHeight: textureMetadata.bottomHeight,
      width: (width ?? textureMetadata.defaultWidth) + texture.borderWidth,
      height: (height ?? textureMetadata.defaultHeight) + texture.borderWidth,
    });

    frame.assetName = 'frame';
    frame.label = id;
    frame.metadata = {
      x,
      y,
      width: width ?? textureMetadata.defaultWidth,
      height: height ?? textureMetadata.defaultHeight,
    };
    const borderWidth = getBorderPadding(texture.borderWidth);
    frame.position.set(x - borderWidth, y - borderWidth);
    frame.isSelected = false;

    if (parent) parent.addChild(frame);
    return frame;
  } catch (e) {
    console.error(e);
    throw e;
  }
};

export const changeFrameComponent = (frame, newAssetName) => {
  const texture = getAsset(`frames-${newAssetName}`);
  if (!texture) return;

  frame.texture = texture;
  const metadata = frame.metadata;
  const borderWidth = getBorderPadding(texture.borderWidth);
  frame.setSize(
    metadata.width + texture.borderWidth,
    metadata.height + texture.borderWidth,
  );
  frame.position.set(metadata.x - borderWidth, metadata.y - borderWidth);

  updateBarComponent(frame);
};

export const getBorderPadding = (borderWidth) =>
  borderWidth ? borderWidth / 2 : 0;
