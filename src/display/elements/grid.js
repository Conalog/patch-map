import { z } from 'zod';
import { isValidationError } from 'zod-validation-error';
import { deepMerge } from '../../utils/deepmerge/deepmerge';
import { validate } from '../../utils/vaildator';
import { changeZIndex } from '../change';
import { changeShow } from '../change';
import { upateComponents } from '../update-components';
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

const updateGridSchema = z
  .object({
    show: z.boolean(),
    zIndex: z.number(),
    components: z.array(
      z
        .object({
          type: z.union([
            z.literal('background'),
            z.literal('bar'),
            z.literal('icon'),
            z.literal('text'),
          ]),
        })
        .passthrough(),
    ),
  })
  .partial();

export const updateGrid = (element, opts) => {
  const config = validate(opts, updateGridSchema);
  if (isValidationError(config)) throw config;

  changeShow(element, config);
  changeZIndex(element, config);
  for (const cell of element.children) {
    upateComponents(cell, config);
  }
  element.config = deepMerge(element.config, config);
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
      });
      item.eventMode = 'static';
      container.addChild(item);
    }
  }
};
