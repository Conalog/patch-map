import { z } from 'zod';
import { isValidationError } from 'zod-validation-error';
import { renderer } from './renderer';
import { selector } from './selector/selector';
import { validate } from './vaildator';

const idsSchema = z.array(z.string()).nullish();

export const focus = (viewport, ids) => {
  checkValidate(ids);
  const bounds = getBounds(viewport, ids);
  if (bounds) {
    moveCenter(viewport, bounds);
  }
};

export const fit = (viewport, ids) => {
  checkValidate(ids);
  const bounds = getBounds(viewport, ids);
  if (bounds) {
    moveCenter(viewport, bounds);
    viewport.fit(true, bounds.width, bounds.height);
  }
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

const checkValidate = (ids) => {
  const validated = validate(ids, idsSchema);
  if (isValidationError(validated)) {
    throw validated;
  }
};

const moveCenter = (viewport, bounds) => {
  viewport.moveCenter(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );
};

const getBounds = (viewport, ids) => {
  const objects = getObjectsById(viewport, ids);
  if (!objects.length) return null;
  const bounds = getObjectsScaleBounds(viewport, objects);
  return bounds;
};

const getObjectsById = (viewport, ids) => {
  if (!ids) return [viewport];
  const objs = selector(
    viewport,
    '$..children[?(@.type != null && @.parent.type !== "item" && @.parent.type !== "relations")]',
  ).reduce((acc, curr) => {
    acc[curr.id] = curr;
    return acc;
  }, {});
  return ids.flatMap((i) => objs[i]).filter((obj) => obj);
};

const getObjectsScaleBounds = (viewport, objects) => {
  const boundsArray = objects.map((obj) => getScaleBounds(viewport, obj));
  const minX = Math.min(...boundsArray.map((b) => b.x));
  const minY = Math.min(...boundsArray.map((b) => b.y));
  const maxX = Math.max(...boundsArray.map((b) => b.x + b.width));
  const maxY = Math.max(...boundsArray.map((b) => b.y + b.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
};
