import gsap from 'gsap';
import { deepMerge } from '../../utils/deepmerge/deepmerge';
import { isSame } from '../../utils/diff/isSame';

export const isMatch = (object, props) => {
  return Object.keys(props).every((key) => {
    const value = props[key];
    return value === undefined || isSame(object[key], value);
  });
};

export const mergeProps = (object, props = {}, overwrite = false) => {
  for (const [key, value] of Object.entries(props)) {
    object[key] = overwrite ? value : deepMerge(object[key], value);
  }
};

export const tweensOf = (object) => gsap.getTweensOf(object);

export const killTweensOf = (object) => gsap.killTweensOf(object);

export const getMaxSize = (size, margin) => ({
  width: size.width - (margin.left + margin.right),
  height: size.height - (margin.top + margin.bottom),
});
