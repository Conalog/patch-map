import { isPlainObject } from 'is-plain-object';
import { createPatch } from './create-patch';

export const isSame = (value1, value2) => {
  if (value1 === value2) {
    return true;
  }

  return hasNoChanges(value1, value2) && hasNoChanges(value2, value1);
};

const hasNoChanges = (value1, value2) => {
  const patch = createPatch(value1, value2);
  return isPlainObject(patch) && Object.keys(patch).length === 0;
};
