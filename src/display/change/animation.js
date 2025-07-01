import { isMatch, mergeProps, tweensOf } from './utils';

export const changeAnimation = (object, { animation }) => {
  if (isMatch(object, { animation })) {
    return;
  }

  if (!animation) {
    tweensOf(object).forEach((tween) => tween.progress(1).kill());
  }
  mergeProps(object, { animation });
};
