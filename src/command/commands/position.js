import { changePosition } from '../../display/change';
import { parsePick } from '../utils';
import { Command } from './base';

const optionKeys = ['position'];

export class PositionCommand extends Command {
  constructor(object, config) {
    super('position_object');
    this.object = object;
    this._config = parsePick(config, optionKeys);
    this._prevConfig = parsePick(this.object.config, optionKeys);
  }

  get config() {
    return this._config;
  }

  get prevConfig() {
    return this._prevConfig;
  }

  execute() {
    changePosition(this.object, this.config);
  }

  undo() {
    changePosition(this.object, this.prevConfig);
  }
}
