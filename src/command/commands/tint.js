import { changeTint } from '../../display/change';
import { deepMerge } from '../../utils/deepmerge/deepmerge';
import { parsePick } from '../utils';
import { Command } from './base';

const optionKeys = ['tint'];

export class TintCommand extends Command {
  constructor(object, config) {
    super('tint_object');
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
    changeTint(this.object, this.config);
    this.object.config = deepMerge(this.object.config, this.config);
  }

  undo() {
    changeTint(this.object, this.prevConfig);
    this.object.config = deepMerge(this.object.config, this.prevConfig);
  }
}
