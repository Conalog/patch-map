export class Command {
  execute() {
    throw new Error('execute() 메서드를 반드시 구현해야 합니다.');
  }
  undo() {
    throw new Error('undo() 메서드를 반드시 구현해야 합니다.');
  }
}
