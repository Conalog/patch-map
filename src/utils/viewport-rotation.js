import { Point } from 'pixi.js';

const tempPoint = new Point();

export const moveViewportCenter = (viewport, center) => {
  if (!viewport || !center) return;
  const angle = viewport.rotation ?? 0;
  if (!angle) {
    viewport.moveCenter(center.x, center.y);
    return;
  }

  const scaleX = viewport.scale?.x ?? 1;
  const scaleY = viewport.scale?.y ?? 1;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const screenCenterX = viewport.screenWidth / 2;
  const screenCenterY = viewport.screenHeight / 2;
  const rotatedX = cos * scaleX * center.x - sin * scaleY * center.y;
  const rotatedY = sin * scaleX * center.x + cos * scaleY * center.y;

  viewport.position.set(screenCenterX - rotatedX, screenCenterY - rotatedY);
  viewport.plugins?.reset?.();
  viewport.dirty = true;
};

export const getViewportWorldCenter = (viewport) => {
  if (!viewport) return { x: 0, y: 0 };
  return viewport.toWorld(viewport.screenWidth / 2, viewport.screenHeight / 2);
};

export const getWorldLocalCenter = (viewport, world) => {
  if (!viewport || !world) return { x: 0, y: 0 };
  tempPoint.set(viewport.screenWidth / 2, viewport.screenHeight / 2);
  return world.toLocal(tempPoint);
};
