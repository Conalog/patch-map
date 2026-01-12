import Element from './elements/Element';

export const draw = (store, data) => {
  const { viewport } = store;
  destroyChildren(viewport);
  viewport.apply(
    { type: 'canvas', children: data },
    { mergeStrategy: 'replace' },
  );
};

const destroyChildren = (parent) => {
  const children = [...parent.children];
  for (const child of children) {
    if (child instanceof Element) {
      child.destroy({ children: true });
    }
  }
};
