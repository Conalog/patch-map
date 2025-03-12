import { Command } from './base';

export class BundleCommand extends Command {
  constructor(bundleId, commands = []) {
    super(bundleId);
    this.commands = commands;
  }

  execute() {
    this.commands.forEach((cmd) => cmd.execute());
  }

  undo() {
    for (let i = this.commands.length - 1; i >= 0; i--) {
      this.commands[i].undo();
    }
  }

  addCommand(command) {
    command.execute();
    this.commands.push(command);
  }
}
