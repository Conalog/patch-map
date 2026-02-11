export const getViewportWorldCenter = (viewport) => {
  if (!viewport) return { x: 0, y: 0 };
  return viewport.toWorld(viewport.screenWidth / 2, viewport.screenHeight / 2);
};

export const getWorldLocalCenter = (viewport, world) => {
  if (!viewport || !world) return { x: 0, y: 0 };
  const worldPoint = getViewportWorldCenter(viewport);
  return world.toLocal(worldPoint, world.parent);
};
