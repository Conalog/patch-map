import { findComponent } from '../../utils/find';
import { drawUpdate } from '../drawUpdate';

export const update = (viewport, { ids, changes, theme } = {}) => {
  if (!ids) {
    throw new Error('The "ids" option is required.');
  }
  if (!changes) {
    throw new Error('The "changes" option is required.');
  }

  const idArray = Array.isArray(ids) ? ids : [ids];
  for (const id of idArray) {
    const frame = findComponent(viewport, 'frame', id);
    drawUpdate(frame, changes, theme);
  }
};
