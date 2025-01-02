import { getAsset } from '../../assets/utils';
import { getBorderPadding } from '../../utils/get';

export const updateFrame = (component, opts = {}) => {
  if (!opts.name || component.option.name === opts.name) return;

  const texture = getAsset(`frames-${opts.name}`);
  if (!texture) return;

  component.texture = texture;
  component.option.name = opts.name;
  const metadata = component._props;
  const borderWidth = getBorderPadding(texture.metadata.borderWidth);
  component.setSize(
    metadata.width + texture.metadata.borderWidth,
    metadata.height + texture.metadata.borderWidth,
  );
  component.position.set(metadata.x - borderWidth, metadata.y - borderWidth);
};
