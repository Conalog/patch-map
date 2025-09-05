/**
 * @fileoverview BundleCommand class implementation for bundling multiple commands.
 */
import { Command } from './base';

/**
 * BundleCommand class.
 * A command that bundles multiple commands together.
 */
export class BundleCommand extends Command {
  /**
   * Creates an instance of BundleCommand.
   * @param {String} bundleId - The identifier for the command bundle.
   * @param {Array<Command>} [commands=[]] - An optional array of initial commands to bundle.
   */
  constructor(bundleId, commands = []) {
    super(bundleId);
    this.commands = commands;
  }

  /**
   * Executes all bundled commands sequentially.
   */
  execute() {
    this.commands.forEach((cmd) => cmd.execute());
  }

  /**
   * Undoes all bundled commands in reverse order.
   */
  undo() {
    for (let i = this.commands.length - 1; i >= 0; i--) {
      this.commands[i].undo();
    }
  }

  /**
   * Executes and adds a command to the bundle.
   * @param {Command} command - The command to add and execute.
   */
  addCommand(command) {
    this.commands.push(command);
  }
}
