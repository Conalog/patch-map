import Element from './elements/Element';

export const draw = (context, data) => {
  const root = context.world ?? context.viewport;
  destroyChildren(root);
  root.apply({ type: 'canvas', children: data }, { mergeStrategy: 'replace' });
};

const destroyChildren = (parent) => {
  const children = [...parent.children];
  for (const child of children) {
    if (child instanceof Element) {
      child.destroy({ children: true });
    }
  }
};
