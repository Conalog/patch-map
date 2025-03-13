import * as change from '..';
import { Commands, undoRedoManager } from '../../../command';

export const pipeline = {
  show: {
    keys: ['show'],
    handler: (object, config, options) => {
      const { historyId } = options;
      if (historyId) {
        undoRedoManager.execute(new Commands.ShowCommand(object, config), {
          historyId,
        });
      } else {
        change.changeShow(object, config);
      }
    },
  },
};
