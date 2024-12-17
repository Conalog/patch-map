export const addPlugins = (viewport, plugins = {}) => {
  for (const [name, options] of Object.entries(plugins)) {
    viewport.plugins.remove(name);
    viewport[name](options);
  }
};

export const removePlugins = (viewport, plugins = []) => {
  for (const name of plugins) {
    viewport.plugins.remove(name);
  }
};

export const resumePlugins = (viewport, plugins = []) => {
  for (const name of plugins) {
    viewport.plugins.resume(name);
  }
};

export const pausePlugins = (viewport, plugins = []) => {
  for (const name of plugins) {
    viewport.plugins.pause(name);
  }
};
