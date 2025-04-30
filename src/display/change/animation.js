import { isConfigMatch, tweensOf, updateConfig } from './utils';

export const changeAnimation = (object, { animation }) => {
  if (isConfigMatch(object, 'animation', animation)) {
    return;
  }
  if (!animation) {
    tweensOf(object).forEach((tween) => tween.progress(1).kill());
  }
  updateConfig(object, { animation });
};
