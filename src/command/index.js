import * as commands from './commands';
import { UndoRedoManager } from './undo-redo-manager';

export const Commands = commands;
export const undoRedoManager = new UndoRedoManager();
