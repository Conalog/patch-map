import { findComponent } from '../../utils/find';
import { drawComponents } from '../draw/components';
import { updateComponents } from './components';
import { updateFrame } from './frame';

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

export const drawUpdate = (frame, changes, theme) => {
  updateFrame(frame, { name: changes.frame });
  if (changes.components && typeof changes.components === 'object') {
    drawComponents(frame, changes.components, theme);
    updateComponents(frame, changes.components, theme);
  }
};
