export const changeTextureTransform = (object) => {
  const borderWidth = object.texture.metadata.borderWidth;
  if (!borderWidth) return;
  const parentSize = object.parent.size;
  object.setSize(
    parentSize.width + borderWidth,
    parentSize.height + borderWidth,
  );
  object.position.set(-borderWidth / 2);
};
