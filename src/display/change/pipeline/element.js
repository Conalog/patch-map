import * as change from '..';
import { Commands, undoRedoManager } from '../../../command';
import { updateComponents } from '../../update/update-components';
import { pipeline } from './pipeline';

export const elementPipeline = {
  ...pipeline,
  position: {
    keys: ['position'],
    handler: (element, config, options) => {
      const { historyId } = options;
      if (historyId) {
        undoRedoManager.execute(new Commands.PositionCommand(element, config), {
          historyId,
        });
      } else {
        change.changePosition(element, config);
      }
    },
  },
  gridComponents: {
    keys: ['components'],
    handler: (element, config) => {
      for (const cell of element.children) {
        updateComponents(cell, config);
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
