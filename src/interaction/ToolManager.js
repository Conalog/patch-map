import Tool from './tools/Tool';

export default class ToolManager {
  #stateStack = [];

  get stateStack() {
    return this.#stateStack;
  }

  get currentTool() {
    return this.stateStack.length > 0
      ? this.stateStack[this.stateStack.length - 1]
      : null;
  }

  pushState(newTool) {
    if (!(newTool instanceof Tool)) {
      throw new Error('Argument must be an instance of Tool');
    }
    if (this.currentTool) {
      this.currentTool.deactivate();
    }
    this.stateStack.push(newTool);
    newTool.activate();
  }

  popState() {
    if (this.currentTool) {
      this.currentTool.deactivate();
      this.stateStack.pop();
    }
    if (this.currentTool) {
      this.currentTool.activate();
    }
  }

  setState(newTool) {
    this.destroy();
    this.pushState(newTool);
  }

  destroy() {
    while (this.currentTool) {
      this.currentTool.deactivate();
      this.#stateStack.pop();
    }
  }
}
