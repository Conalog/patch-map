import gsap from 'gsap';
import { changePlacement } from './placement';
import { isConfigMatch, killTweensOf, updateConfig } from './utils';

export const changePercentSize = (
  object,
  {
    width = object.config.width,
    height = object.config.height,
    margin = object.config.margin,
    animationDuration = object.config.animationDuration,
  },
  { animationContext },
) => {
  if (
    isConfigMatch(object, 'width', width) &&
    isConfigMatch(object, 'height', height) &&
    isConfigMatch(object, 'margin', margin)
  ) {
    return;
  }

  if (width.unit === '%') {
    changeWidth(object, width, margin);
  }
  if (height.unit === '%') {
    changeHeight(object, height, margin);
  }
  updateConfig(object, {
    width,
    height,
    margin,
    animationDuration,
  });

  function changeWidth(component, width, marginObj) {
    const maxWidth =
      component.parent.size.width - (marginObj.left + marginObj.right);
    component.width = maxWidth * (width.value / 100);
  }

  function changeHeight(component, height) {
    const maxHeight =
      component.parent.size.height - (margin.top + margin.bottom);

    if (object.config.animation) {
      animationContext.add(() => {
        killTweensOf(component);
        gsap.to(component, {
          pixi: { height: maxHeight * (height.value / 100) },
          duration: animationDuration / 1000,
          ease: 'power2.inOut',
          onUpdate: () => changePlacement(component, {}),
        });
      });
    } else {
      component.height = maxHeight * height;
    }
  }
};
