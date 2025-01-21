import { deepMerge } from '../../utils/deepmerge/deepmerge';
import { changeZIndex } from '../change';
import { changeShow } from '../change';
import { changeLayout } from '../change';
import { createContainer } from '../utils';
import { createItem } from './item';

const GRID_OBJECT_CONFIG = {
  margin: 4,
};

export const createGrid = (config) => {
  const element = createContainer(config);
  element.position.set(config.position.x, config.position.y);
  element.angle = config.rotation;
  element.transform = { ...config.size };
  element.config = config;

  addItemElements(element, config.cells);
  return element;
};

export const updateGrid = (element, config) => {
  changeShow(element, config);
  changeZIndex(element, config);

  for (const cell of element.children) {
    changeLayout(cell, config);
  }
  element.config = deepMerge(element.config, config);
};

const addItemElements = (container, cells) => {
  for (let rowIndex = 0; rowIndex < cells.length; rowIndex++) {
    const row = cells[rowIndex];
    for (let colIndex = 0; colIndex < row.length; colIndex++) {
      const col = row[colIndex];
      if (!col || col === 0) continue;

      const item = createItem({
        type: 'item',
        id: `${container.id}.${rowIndex}.${colIndex}`,
        position: {
          x: colIndex * (container.transform.width + GRID_OBJECT_CONFIG.margin),
          y:
            rowIndex * (container.transform.height + GRID_OBJECT_CONFIG.margin),
        },
        size: {
          width: container.transform.width,
          height: container.transform.height,
        },
      });
      item.eventMode = 'static';
      container.addChild(item);
    }
  }
};
