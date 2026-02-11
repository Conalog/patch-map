import Element from './elements/Element';

export const draw = (store, data) => {
  const root = store.world ?? store.viewport;
  destroyChildren(root);
  root.apply(
    { type: 'canvas', children: data },
    { mergeStrategy: 'replace', validateSchema: false },
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
