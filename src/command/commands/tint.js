/**
 * @fileoverview TintCommand class implementation for changing the tint of an object with undo/redo functionality.
 */

import { changeTint } from '../../display/change';
import { parsePick } from '../utils';
import { Command } from './base';

const optionKeys = ['tint'];

/**
 * TintCommand class.
 * A command for changing the tint of an object with undo/redo functionality.
 */
export class TintCommand extends Command {
  /**
   * Creates an instance of TintCommand.
   * @param {Object} object - The Pixi.js display object whose tint will be changed.
   * @param {Object} config - The new configuration for the object's tint.
   */
  constructor(object, config, options) {
    super('tint_object');
    this.object = object;
    this._config = parsePick(config, optionKeys);
    this._prevConfig = parsePick(object.config, optionKeys);
    this._options = options;
  }

  get config() {
    return this._config;
  }

  get prevConfig() {
    return this._prevConfig;
  }

  get options() {
    return this._options;
  }

  /**
   * Executes the command to change the object's tint.
   */
  execute() {
    changeTint(this.object, this.config, this.options);
  }

  /**
   * Undoes the command, reverting the object's tint to its previous state.
   */
  undo() {
    changeTint(this.object, this.prevConfig, this.options);
  }
}
