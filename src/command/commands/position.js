import { changePosition } from '../../display/change';
import { deepMerge } from '../../utils/deepmerge/deepmerge';
import { parsePick } from '../utils';
import { Command } from './base';

const optionKeys = ['position'];

export class PositionCommand extends Command {
  constructor(object, config) {
    super('position_object');
    this.object = object;

    this.config = parsePick(config, optionKeys);
    this.prevConfig = parsePick(this.object.config, optionKeys);
  }

  execute() {
    changePosition(this.object, this.config);
    this.object.config = deepMerge(this.object.config, this.config);
  }

  undo() {
    changePosition(this.object, this.prevConfig);
    this.object.config = deepMerge(this.object.config, this.prevConfig);
  }
}
