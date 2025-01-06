import { findComponent, findContainer } from './find';

export const focus = (viewport, id) => {
  const bounds = getScaleBounds(viewport, getObject(viewport, id) ?? viewport);
  viewport.moveCenter(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );
};

export const fit = (viewport, id) => {
  focus(viewport, id);
  const bounds = getScaleBounds(viewport, getObject(viewport, id) ?? viewport);
  viewport.fit(true, bounds.width, bounds.height);
};

const getObject = (viewport, id) =>
  id
    ? findContainer(viewport, id) || findComponent(viewport, 'frame', id)
    : null;

export const getScaleBounds = (viewport, object) => {
  const bounds = object.getBounds();
  return {
    x: (bounds.x - viewport.position.x) / viewport.scale.x,
    y: (bounds.y - viewport.position.y) / viewport.scale.y,
    width: bounds.width / viewport.scale.x,
    height: bounds.height / viewport.scale.y,
  };
};
