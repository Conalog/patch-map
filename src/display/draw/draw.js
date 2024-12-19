import { findComponents, findContainers } from '../../utils/find';
import { drawUpdate } from '../drawUpdate';
import { drawFrame } from './drawFrame';

export const draw = (viewport, isNewData, opts = {}) => {
  if (isNewData) {
    drawFrame(viewport, opts.mapData, opts);
  }

  const containers = findContainers(viewport);
  for (const container of containers) {
    const componentOptions = opts[container.type].components ?? {};
    const frames = findComponents('frame', [container]);

    for (const frame of frames) {
      drawUpdate(frame, componentOptions, opts.theme);
    }
  }
};
