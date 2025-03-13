import { changeShow } from '../../display/change';
import { deepMerge } from '../../utils/deepmerge/deepmerge';
import { parsePick } from '../utils';
import { Command } from './base';

const optionKeys = ['show'];

export class ShowCommand extends Command {
  constructor(object, config) {
    super('show_object');
    this.object = object;

    this.config = parsePick(config, optionKeys);
    this.prevConfig = parsePick(object.config, optionKeys);
  }

  execute() {
    changeShow(this.object, this.config);
    this.object.config = deepMerge(this.object.config, this.config);
  }

  undo() {
    changeShow(this.object, this.prevConfig);
    this.object.config = deepMerge(this.object.config, this.prevConfig);
  }
}
