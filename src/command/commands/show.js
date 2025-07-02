/**
 * @fileoverview ShowCommand class implementation for toggling the show state of an object.
 */
import { changeShow } from '../../display/change';
import { parsePick } from '../utils';
import { Command } from './base';

const optionKeys = ['show'];

/**
 * ShowCommand class.
 * A command for toggling the visibility state of an object.
 */
export class ShowCommand extends Command {
  /**
   * Creates an instance of ShowCommand.
   * @param {Object} object - The Pixi.js display object whose renderable will be changed.
   * @param {Object} config - The new configuration containing the show state.
   */
  constructor(object, config) {
    super('show_object');
    this.object = object;
    this._config = parsePick(config, optionKeys);
    this._prevConfig = parsePick(object, optionKeys);
  }

  get config() {
    return this._config;
  }

  get prevConfig() {
    return this._prevConfig;
  }

  /**
   * Executes the command to change the object's show state.
   */
  execute() {
    changeShow(this.object, this.config);
  }

  /**
   * Undoes the command, reverting the object's show state to its previous state.
   */
  undo() {
    changeShow(this.object, this.prevConfig);
  }
}
