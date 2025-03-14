import { changeShow } from '../../display/change';
import { parsePick } from '../utils';
import { Command } from './base';

const optionKeys = ['show'];

export class ShowCommand extends Command {
  constructor(object, config) {
    super('show_object');
    this.object = object;
    this._config = parsePick(config, optionKeys);
    this._prevConfig = parsePick(object.config, optionKeys);
  }

  get config() {
    return this._config;
  }

  get prevConfig() {
    return this._prevConfig;
  }

  execute() {
    changeShow(this.object, this.config);
  }

  undo() {
    changeShow(this.object, this.prevConfig);
  }
}
