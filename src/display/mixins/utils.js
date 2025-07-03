import { OrientedBounds } from '@pixi-essentials/bounds';
import gsap from 'gsap';
import { Matrix, Transform } from 'pixi.js';
import {
  decomposeTransform,
  getBoundsFromPoints,
  getCentroid,
  getObjectWorldCorners,
} from '../../utils/transform';

export const tweensOf = (object) => gsap.getTweensOf(object);

export const killTweensOf = (object) => gsap.killTweensOf(object);

export const getMaxSize = (
  size,
  margin = { top: 0, right: 0, bottom: 0, left: 0 },
) => {
  const { top = 0, right = 0, bottom = 0, left = 0 } = margin || {};
  return {
    width: size.width - (left + right),
    height: size.height - (top + bottom),
  };
};

export const calcSize = (component, { source, size, margin }) => {
  const { width: maxWidth, height: maxHeight } = getMaxSize(
    component.parent.props.size,
    margin,
  );

  const borderWidth =
    typeof source === 'object' ? (source?.borderWidth ?? 0) : 0;

  return {
    width:
      (size.width.unit === '%'
        ? maxWidth * (size.width.value / 100)
        : size.width.value) + borderWidth,
    height:
      (size.height.unit === '%'
        ? maxHeight * (size.height.value / 100)
        : size.height.value) + borderWidth,
    borderWidth: borderWidth,
  };
};

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
