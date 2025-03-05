import { isPlainObject } from 'is-plain-object';
import { diffJson } from './diff-json';

export const diff = (value1, value2) => {
  if (!isPlainObject(value1) || !isPlainObject(value2)) {
    return value1 === value2;
  }

  const json = diffJson(value1, value2);
  return Object.keys(json).length === 0;
};
