import { drawComponents } from './draw/drawComponents';
import {
  updateBarComponent,
  updateIconComponent,
} from './update/updateComponents';
import { updateFrame } from './update/updateFrame';
import { getDifferentValues } from './utils';

export const drawUpdate = (frame, changes, theme) => {
  drawComponents(frame, changes, theme);

  if (frame.option.name !== changes.frame) {
    updateFrame(frame, { name: changes.frame });
  }

  for (const [type, component] of Object.entries(frame.components)) {
    if (!component.renderable) continue;
    const options = getDifferentValues(component.option, changes[type]);

    if (type === 'icon') {
      updateIconComponent(component, theme, options);
    } else if (type === 'bar') {
      updateBarComponent(component, theme, options);
    }
  }
};
