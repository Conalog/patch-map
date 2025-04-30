import gsap from 'gsap';
import { parseMargin } from '../utils';
import { changePlacement } from './placement';
import { isConfigMatch, tweensOf, updateConfig } from './utils';

export const changePercentSize = (
  object,
  {
    percentWidth = object.config.percentWidth,
    percentHeight = object.config.percentHeight,
    margin = object.config.margin,
    animationDuration = object.config.animationDuration,
  },
) => {
  if (
    isConfigMatch(object, 'percentWidth', percentWidth) &&
    isConfigMatch(object, 'percentHeight', percentHeight) &&
    isConfigMatch(object, 'margin', margin)
  ) {
    return;
  }

  const marginObj = parseMargin(margin);
  if (percentWidth) changeWidth(object, percentWidth, marginObj);
  if (percentHeight) changeHeight(object, percentHeight, marginObj);
  updateConfig(object, {
    percentWidth,
    percentHeight,
    margin,
    animationDuration,
  });

  function changeWidth(component, percentWidth, marginObj) {
    const maxWidth =
      component.parent.size.width - (marginObj.left + marginObj.right);
    component.width = maxWidth * percentWidth;
  }

  function changeHeight(component, percentHeight) {
    const maxHeight =
      component.parent.size.height - (marginObj.top + marginObj.bottom);

    if (object.config.animation) {
      tweensOf(component).forEach((tween) => tween.kill());
      gsap.to(component, {
        pixi: { height: maxHeight * percentHeight },
        duration: animationDuration / 1000,
        ease: 'power2.inOut',
        onUpdate: () => changePlacement(component, {}),
      });
    } else {
      component.height = maxHeight * percentHeight;
    }
  }
};
