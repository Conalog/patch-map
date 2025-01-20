import { convertArray } from '../utils/convert';
import { selector } from '../utils/selector/selector';
import { changeShow, changeZIndex } from './change';
import { updateGrid } from './elements/grid';
import { updateItem } from './elements/item';

/**
 * Schema for updating configuration.
 *
 * @typedef {Object} UpdateConfig
 * @property {Array<Record<string, unknown>> | Record<string, unknown>} elements - The elements to be updated. Must be an array of objects or a single object.
 * @property {string} [path=''] - The path to the elements.
 * @property {Record<string, unknown>} changes - The changes to be applied to the elements. Must be an object.
 */

export const update = (parent, config) => {
  if (typeof config !== 'object') {
    console.error('Invalid config: expected an object.');
    return;
  }

  if (!('changes' in config)) {
    console.error('Missing "changes" in config.');
    return;
  }

  const elements = 'elements' in config ? convertArray(config.elements) : [];
  if (parent && config.path) {
    elements.push(...selector(parent, config.path));
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
