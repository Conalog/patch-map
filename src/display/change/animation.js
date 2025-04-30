import gsap from 'gsap';
import { isConfigMatch, updateConfig } from './utils';

export const changeAnimation = (object, { animation }) => {
  if (isConfigMatch(object, 'animation', animation)) {
    return;
  }
  gsap.getTweensOf(object).forEach((tween) => tween.progress(1).kill());
  updateConfig(object, { animation });
};
