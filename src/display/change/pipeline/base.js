import * as change from '..';
import { Commands } from '../../../command';
import { createCommandHandler } from './utils';

export const pipeline = {
  show: {
    keys: ['show'],
    handler: createCommandHandler(Commands.ShowCommand, change.changeShow),
  },
};
