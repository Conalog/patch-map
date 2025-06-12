import * as change from '..';
import { Commands } from '../../../command';
import { createCommandHandler } from './utils';

export const basePipeline = {
  show: {
    keys: ['show'],
    handler: createCommandHandler(Commands.ShowCommand, change.changeShow),
  },
};
