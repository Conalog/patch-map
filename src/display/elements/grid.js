import { changeZIndex } from '../change';
import { changeShow } from '../change';
import { changeLayout } from '../change';
import { createContainer } from '../utils';
import { createItem } from './item';

const GRID_OBJECT_CONFIG = {
  margin: 4,
};

export const createGrid = (config) => {
  const container = createContainer(config);
  container.position.set(config.position.x, config.position.y);
  container.angle = config.rotation;
  container.transform = { ...config.size };

  addItemElements(container, config.cells);
  return container;
};

export const updateGrid = (element, config) => {
  changeShow(element, config);
  changeZIndex(element, config);

  for (const cell of element.children) {
    changeLayout(cell, config);
  }
};

const addItemElements = (container, cells) => {
  for (let rowIndex = 0; rowIndex < cells.length; rowIndex++) {
    const row = cells[rowIndex];
    for (let colIndex = 0; colIndex < row.length; colIndex++) {
      const col = row[colIndex];
      if (!col || col === 0) continue;

      const item = createItem({
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
      container.addChild(item);
    }
  }
};
