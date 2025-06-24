import * as change from '..';
import { Commands } from '../../../command';
import { updateComponents } from '../../update/update-components';
import { basePipeline } from './base';
import { createCommandHandler } from './utils';

export const elementPipeline = {
  ...basePipeline,
  position: {
    keys: ['x', 'y'],
    handler: createCommandHandler(
      Commands.PositionCommand,
      change.changePosition,
    ),
  },
  gridComponents: {
    keys: ['components'],
    handler: (element, config, options) => {
      for (const cell of element.children) {
        updateComponents(cell, config, options);
      }
    },
  },
  components: {
    keys: ['components'],
    handler: updateComponents,
  },
  links: {
    keys: ['links'],
    handler: change.changeLinks,
  },
  strokeStyle: {
    keys: ['strokeStyle'],
    handler: change.changeStrokeStyle,
  },
};
