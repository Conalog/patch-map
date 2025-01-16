import { convertArray } from '../utils/convert';
import { changeShow, changeZIndex } from './change';
import { updateGrid } from './elements/grid';
import { updateItem } from './elements/item';

export const update = (parent, config) => {
  const elements = convertArray(config.elements) ?? [];
  if (parent) {
  }

  for (const element of elements) {
    if (element.type === 'group') {
      changeShow(element, config.changes);
      changeZIndex(element, config.changes);
    } else if (element.type === 'grid') {
      updateGrid(element, config.changes);
    } else if (element.type === 'item') {
      updateItem(element, config.changes);
    }
  }
};
