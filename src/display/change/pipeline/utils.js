export const createCommandHandler = (Command, changeFn) => {
  return (object, config, options) => {
    const { undoRedoManager } = options;
    if (options?.historyId) {
      undoRedoManager.execute(new Command(object, config, options), {
        historyId: options.historyId,
      });
    } else {
      changeFn(object, config, options);
    }
  };
};
