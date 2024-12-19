import { getAsset } from '../../assets/utils';
import { getBorderPadding } from '../utils';

export const updateFrame = (component, opts = {}) => {
  if (opts.name) {
    const texture = getAsset(`frames-${opts.name}`);
    if (!texture) return;

    component.texture = texture;
    component.option.name = opts.name;
    const metadata = component.metadata;
    const borderWidth = getBorderPadding(texture.metadata.borderWidth);
    component.setSize(
      metadata.width + texture.metadata.borderWidth,
      metadata.height + texture.metadata.borderWidth,
    );
    component.position.set(metadata.x - borderWidth, metadata.y - borderWidth);
  }
};
