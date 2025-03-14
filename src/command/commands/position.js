/**
 * @fileoverview PositionCommand class implementation for changing object positions with undo/redo functionality.
 */
import { changePosition } from '../../display/change';
import { parsePick } from '../utils';
import { Command } from './base';

const optionKeys = ['position'];

/**
 * PositionCommand class.
 * A command for changing the position of an object with undo/redo functionality.
 */
export class PositionCommand extends Command {
  /**
   * Creates an instance of PositionCommand.
   * @param {Object} object - The Pixi.js display object whose position will be changed.
   * @param {Object} config - The new configuration for the object's position.
   */
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

  /**
   * Executes the command to change the object's position.
   */
  execute() {
    changePosition(this.object, this.config);
  }

  /**
   * Undoes the command, reverting the object's position to its previous state.
   */
  undo() {
    changePosition(this.object, this.prevConfig);
  }
}
