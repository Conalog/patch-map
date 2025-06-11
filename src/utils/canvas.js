export const getScaleBounds = (viewport, object) => {
  const bounds = object.getBounds();
  return {
    x: (bounds.x - viewport.position.x) / viewport.scale.x,
    y: (bounds.y - viewport.position.y) / viewport.scale.y,
    width: bounds.width / viewport.scale.x,
    height: bounds.height / viewport.scale.y,
  };
};

export const getPointerPosition = (viewport) => {
  const renderer = viewport.app.renderer;
  const global = renderer.events.pointer.global;
  return viewport ? viewport.toWorld(global.x, global.y) : global;
};
