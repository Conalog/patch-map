export const getPointerPosition = (viewport) => {
  const renderer = viewport?.app?.renderer;
  const global = renderer?.events.pointer.global;
  return viewport ? viewport.toWorld(global.x, global.y) : global;
};
