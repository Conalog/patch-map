import { drawComponents } from './draw/drawComponents';
import {
  updateBarComponent,
  updateIconComponent,
} from './update/updateComponents';
import { updateFrame } from './update/updateFrame';
import { getDifferentValues } from './utils';

export const drawUpdate = (frame, changes, theme) => {
  drawComponents(frame, changes.components, theme);

  if (frame.option.name !== changes.frame) {
    updateFrame(frame, { name: changes.frame });
  }

  if (changes.components && typeof changes.components === 'object') {
    for (const [type, change] of Object.entries(changes.components)) {
      const component = frame.components[type];
      if (!component || !component.renderable) continue;

      const options = getDifferentValues(component.option, change);
      if (type === 'icon') {
        updateIconComponent(component, theme, options);
      } else if (type === 'bar') {
        updateBarComponent(component, theme, options);
      }
    }
  }
};
