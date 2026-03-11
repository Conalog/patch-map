import Element from './elements/Element';

export const draw = (store, data) => {
  destroyChildren(store.world);
  store.world.apply(
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
