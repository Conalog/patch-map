export const createCommandHandler = (Command, changeFn) => {
  return (object, config, undoRedoManager, options) => {
    if (options?.historyId) {
      undoRedoManager.execute(new Command(object, config), {
        historyId: options.historyId,
      });
    } else {
      changeFn(object, config);
    }
  };
};
