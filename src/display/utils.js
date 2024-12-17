import { getCenterPointObject } from '../utils/get';

export const setPosiionCenter = (parent, child) => {
  const centerPoint = getCenterPointObject(parent);
  child.position.set(
    centerPoint.x - child.width / 2,
    centerPoint.y - child.height / 2,
  );
};

export const getDifferentValues = (obj1, obj2) => {
  const differences = {};
  for (const key in obj2) {
    if (!(key in obj1) || obj1[key] !== obj2[key]) {
      differences[key] = obj2[key];
    }
  }
  return differences;
};


