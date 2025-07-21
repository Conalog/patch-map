import { describe, expect, it, vi } from 'vitest';
import { Command } from './commands/base';
import { BundleCommand } from './commands/bundle';
import { UndoRedoManager } from './undo-redo-manager';

/**
 * A mock command for testing purposes.
 * It tracks how many times execute and undo have been called.
 */
class MockCommand extends Command {
  constructor(id = null) {
    super(id);
    this.executeCount = 0;
    this.undoCount = 0;
  }

  execute() {
    this.executeCount++;
  }

  undo() {
    this.undoCount++;
  }
}

describe('UndoRedoManager', () => {
  it('should correctly execute a command and add it to the history', () => {
    const manager = new UndoRedoManager();
    const command = new MockCommand();

    manager.execute(command);

    expect(command.executeCount).toBe(1);
    expect(manager.commands).toHaveLength(1);
    expect(manager.canUndo()).toBe(true);
    expect(manager.canRedo()).toBe(false);
  });

  it('should correctly undo and redo a command', () => {
    const manager = new UndoRedoManager();
    const command = new MockCommand();

    manager.execute(command);

    // Undo
    manager.undo();
    expect(command.undoCount).toBe(1);
    expect(manager.canUndo()).toBe(false);
    expect(manager.canRedo()).toBe(true);

    // Redo
    manager.redo();
    expect(command.executeCount).toBe(2); // Initial execute + redo
    expect(manager.canUndo()).toBe(true);
    expect(manager.canRedo()).toBe(false);
  });

  it('should clear the redo stack after a new command is executed', () => {
    const manager = new UndoRedoManager();
    const command1 = new MockCommand();
    const command2 = new MockCommand();

    manager.execute(command1);
    manager.undo();

    expect(manager.canRedo()).toBe(true);

    manager.execute(command2);

    expect(command2.executeCount).toBe(1);
    expect(manager.commands).toHaveLength(1);
    expect(manager.commands[0]).toBe(command2);
    expect(manager.canRedo()).toBe(false);
  });

  it('should respect the maxCommands limit', () => {
    const manager = new UndoRedoManager(3); // Max 3 commands
    const commands = [
      new MockCommand(),
      new MockCommand(),
      new MockCommand(),
      new MockCommand(),
    ];

    manager.execute(commands[0]);
    manager.execute(commands[1]);
    manager.execute(commands[2]);
    manager.execute(commands[3]);

    expect(manager.commands).toHaveLength(3);
    expect(manager.commands[0]).toBe(commands[1]); // The first command should be discarded
    expect(manager.canUndo()).toBe(true);
  });

  it('should clear the entire command history', () => {
    const manager = new UndoRedoManager();
    manager.execute(new MockCommand());
    manager.execute(new MockCommand());

    expect(manager.commands).toHaveLength(2);

    manager.clear();

    expect(manager.commands).toHaveLength(0);
    expect(manager.canUndo()).toBe(false);
    expect(manager.canRedo()).toBe(false);
  });

  it('should bundle commands with the same historyId', () => {
    const manager = new UndoRedoManager();
    const command1 = new MockCommand('bundle-1');
    const command2 = new MockCommand('bundle-1');
    const command3 = new MockCommand('bundle-2');

    manager.execute(command1, { historyId: 'bundle-1' });
    manager.execute(command2, { historyId: 'bundle-1' });
    manager.execute(command3, { historyId: 'bundle-2' });

    expect(manager.commands).toHaveLength(2); // Two bundles
    expect(manager.commands[0]).toBeInstanceOf(BundleCommand);
    expect(manager.commands[0].commands).toHaveLength(2);
    expect(manager.commands[0].commands[0]).toBe(command1);
    expect(manager.commands[0].commands[1]).toBe(command2);
    expect(manager.commands[1]).toBeInstanceOf(BundleCommand);
  });

  it('should correctly undo/redo a bundle of commands', () => {
    const manager = new UndoRedoManager();
    const command1 = new MockCommand('bundle-1');
    const command2 = new MockCommand('bundle-1');

    manager.execute(command1, { historyId: 'bundle-1' });
    manager.execute(command2, { historyId: 'bundle-1' });

    expect(command1.executeCount).toBe(1);
    expect(command2.executeCount).toBe(1);

    // Undo the whole bundle
    manager.undo();
    expect(command1.undoCount).toBe(1);
    expect(command2.undoCount).toBe(1);

    // Redo the whole bundle
    manager.redo();
    expect(command1.executeCount).toBe(2);
    expect(command2.executeCount).toBe(2);
  });

  it('should correctly notify subscribers on state changes', () => {
    const manager = new UndoRedoManager();
    const listener = vi.fn();
    const unsubscribe = manager.subscribe(listener);

    expect(listener).toHaveBeenCalledTimes(1);

    manager.execute(new MockCommand());
    expect(listener).toHaveBeenCalledTimes(2);

    manager.undo();
    expect(listener).toHaveBeenCalledTimes(3);

    manager.redo();
    expect(listener).toHaveBeenCalledTimes(4);

    manager.clear();
    expect(listener).toHaveBeenCalledTimes(5);

    unsubscribe();
    manager.execute(new MockCommand());
    expect(listener).toHaveBeenCalledTimes(5);
  });
});
