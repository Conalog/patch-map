import { findComponents, findContainers } from '../utils/find';
import { updateBarComponent } from './components/bar';
import { updateFrameComponent } from './components/frame';
import { updateIconComponent } from './components/icon';
import { drawComponents } from './draw/drawComponents';
import { drawFrame } from './draw/drawFrame';
import { getDifferentValues } from './utils';

export const draw = (viewport, isNewData, opts = {}) => {
  if (isNewData) {
    drawFrame(viewport, opts.mapData, opts);
  }

  const containers = findContainers(viewport);
  for (const container of containers) {
    const componentOptions = opts[container.type].components ?? {};
    const frames = findComponents('frame', [container]);
    for (const frame of frames) {
      drawComponents(frame, componentOptions, opts.theme);

      if (frame.option.name !== opts[container.type].frame) {
        updateFrameComponent(frame, { name: opts[container.type].frame });
      }

      for (const [type, component] of Object.entries(frame.components)) {
        if (!component.renderable) continue;
        const options = getDifferentValues(
          component.option,
          componentOptions[type],
        );

        if (type === 'icon') {
          updateIconComponent(component, opts.theme, options);
        } else if (type === 'bar') {
          updateBarComponent(component, opts.theme, {
            ...options,
            data: opts[container.type].data,
          });
        } else if (type === 'text') {
        }
      }
    }
  }
};
