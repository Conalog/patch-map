const rendererStore = () => {
  let _renderer = null;

  const set = (renderer) => {
    _renderer = renderer;
  };

  const get = () => _renderer;

  return { set, get };
};

export const renderer = rendererStore();
