import gsap from 'gsap';
import { changePlacement } from './placement';
import { isMatch, killTweensOf, mergeProps } from './utils';

export const changePercentSize = (
  object,
  {
    size = object.size,
    margin = object.margin,
    animationDuration = object.animationDuration,
  },
  { animationContext },
) => {
  if (isMatch(object, { size, margin })) {
    return;
  }

  const { width = object.size.width, height = object.size.height } = size;

  if (width.unit === '%') {
    changeWidth(object, width, margin);
  }
  if (height.unit === '%') {
    changeHeight(object, height, margin);
  }
  mergeProps(object, { size, margin, animationDuration });

  function changeWidth(component, width, marginObj) {
    const maxWidth =
      component.parent.size.width - (marginObj.left + marginObj.right);
    component.width = maxWidth * (width.value / 100);
  }

  function changeHeight(component, height) {
    const maxHeight =
      component.parent.size.height - (margin.top + margin.bottom);

    if (object.animation) {
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
