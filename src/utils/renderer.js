const rendererStore = () => {
  let _renderer = null;

  const set = (app) => {
    _renderer = app.renderer;
  };

  const get = () => _renderer;

  return { set, get };
};

export const renderer = rendererStore();
