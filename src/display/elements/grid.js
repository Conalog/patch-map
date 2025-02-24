import { changeShow } from '../change';
import { updateComponents } from '../components/update-components';
import { updateObject } from '../update-object';
import { createContainer } from '../utils';
import { createItem } from './item';

const GRID_OBJECT_CONFIG = {
  margin: 4,
};

export const createGrid = (config) => {
  const element = createContainer(config);
  element.position.set(config.position.x, config.position.y);
  element.angle = config.rotation;
  element.config = {};
  addItemElements(element, config.cells, config.size);
  return element;
};

const pipeline = [
  { keys: ['show'], handler: changeShow },
  {
    keys: ['components'],
    handler: (element, options) => {
      for (const cell of element.children) {
        updateComponents(cell, options);
      }
    },
  },
];
const pipelineKeys = new Set(pipeline.flatMap((item) => item.keys));

export const updateGrid = (element, options) => {
  updateObject(element, options, pipeline, pipelineKeys);
};

const addItemElements = (container, cells, cellSize) => {
  for (let rowIndex = 0; rowIndex < cells.length; rowIndex++) {
    const row = cells[rowIndex];
    for (let colIndex = 0; colIndex < row.length; colIndex++) {
      const col = row[colIndex];
      if (!col || col === 0) continue;

      const item = createItem({
        type: 'item',
        id: `${container.id}.${rowIndex}.${colIndex}`,
        position: {
          x: colIndex * (cellSize.width + GRID_OBJECT_CONFIG.margin),
          y: rowIndex * (cellSize.height + GRID_OBJECT_CONFIG.margin),
        },
        size: {
          width: cellSize.width,
          height: cellSize.height,
        },
        metadata: {
          index: colIndex + row.length * rowIndex,
        },
      });
      item.eventMode = 'static';
      container.addChild(item);
    }
  }
};
