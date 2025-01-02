import { findComponents, findContainers } from '../../utils/find';
import { drawUpdate } from '../update/update';
import { drawFrame } from './frame';

export const draw = (viewport, isNewData, opts = {}) => {
  if (isNewData) {
    drawFrame(viewport, opts.mapData.objects, opts);
  }

  const containers = findContainers(viewport);
  const frames = findComponents('frame', containers);
  for (const frame of frames) {
    if (!opts[frame.parent.group]) continue;
    drawUpdate(frame, opts[frame.parent.group], opts.theme);
  }
  containers.forEach((container) => container.sortChildren());
};
