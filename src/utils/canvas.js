import { renderer } from './renderer';
import { selector } from './selector/selector';

export const focus = (viewport, id) => {
  const object = getObject(viewport, id);
  if (!object.length) return;
  const bounds = getScaleBounds(viewport, object[0]);
  viewport.moveCenter(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );
};

export const fit = (viewport, id) => {
  focus(viewport, id);
  const object = getObject(viewport, id);
  if (!object.length) return;
  const bounds = getScaleBounds(viewport, object[0]);
  viewport.fit(true, bounds.width, bounds.height);
};

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
  const global = renderer.get().events.pointer.global;
  return viewport ? viewport.toWorld(global.x, global.y) : global;
};

const getObject = (viewport, id) => {
  return id ? selector(viewport, `$..children[?(@.id=="${id}")]`) : [viewport];
};
