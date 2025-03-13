export const changeTextureTransform = (component) => {
  const borderWidth = component.texture.metadata.borderWidth;
  if (!borderWidth) return;
  const parentSize = component.parent.size;
  component.setSize(
    parentSize.width + borderWidth,
    parentSize.height + borderWidth,
  );
  component.position.set(-borderWidth / 2);
};
