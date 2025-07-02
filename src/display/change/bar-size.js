import gsap from 'gsap';
import { changePlacement } from './placement';
import { isMatch, killTweensOf, mergeProps } from './utils';

export const changeBarSize = (
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

  changeWidth(object, width, margin);
  changeHeight(object, height, margin);
  mergeProps(object, { size, margin, animationDuration });

  function changeWidth(component, width, margin) {
    const maxWidth = component.parent.size.width - (margin.left + margin.right);
    component.width =
      width.unit === '%' ? maxWidth * (width.value / 100) : width.value;
  }

  function changeHeight(component, height, margin) {
    const maxHeight =
      component.parent.size.height - (margin.top + margin.bottom);
    const heightValue =
      height.unit === '%' ? maxHeight * (height.value / 100) : height.value;

    if (object.animation) {
      animationContext.add(() => {
        killTweensOf(component);
        gsap.to(component, {
          pixi: {
            height: heightValue,
          },
          duration: animationDuration / 1000,
          ease: 'power2.inOut',
          onUpdate: () => changePlacement(component, {}),
        });
      });
    } else {
      component.height = heightValue;
    }
  }
};
