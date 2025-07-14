import { OrientedBounds } from '@pixi-essentials/bounds';
import { Matrix, Transform } from 'pixi.js';
import {
  decomposeTransform,
  getBoundsFromPoints,
  getCentroid,
  getObjectWorldCorners,
} from './transform';

const tempBounds = new OrientedBounds();
const tempTransform = new Transform();
const tempMatrix = new Matrix();

export const calcOrientedBounds = (object, bounds = tempBounds) => {
  decomposeTransform(tempTransform, object.worldTransform);
  const worldRotation = tempTransform.rotation;
  const worldCorners = getObjectWorldCorners(object);
  const centroid = getCentroid(worldCorners);

  const unrotateMatrix = tempMatrix;
  unrotateMatrix
    .identity()
    .translate(-centroid.x, -centroid.y)
    .rotate(-worldRotation)
    .translate(centroid.x, centroid.y);
  unrotateMatrix.apply(worldCorners[0], worldCorners[0]);
  unrotateMatrix.apply(worldCorners[1], worldCorners[1]);
  unrotateMatrix.apply(worldCorners[2], worldCorners[2]);
  unrotateMatrix.apply(worldCorners[3], worldCorners[3]);

  const innerBounds = getBoundsFromPoints(worldCorners);
  const resultBounds = bounds || new OrientedBounds();
  resultBounds.rotation = worldRotation;
  resultBounds.innerBounds.copyFrom(innerBounds);
  resultBounds.update();
  return resultBounds;
};

export const calcGroupOrientedBounds = (group, bounds = tempBounds) => {
  if (!group || group.length === 0) {
    return;
  }

  const allWorldCorners = group.flatMap((element) => {
    return getObjectWorldCorners(element);
  });
  const groupInnerBounds = getBoundsFromPoints(allWorldCorners);
  const resultBounds = bounds || new OrientedBounds();
  resultBounds.rotation = 0;
  resultBounds.innerBounds.copyFrom(groupInnerBounds);
  resultBounds.update();
  return resultBounds;
};
