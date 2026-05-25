import { SceneIndex } from './model/SceneIndex';

export const draw = (store, data) => {
  resetElementIndex(store);
  destroyChildren(store.world);
  store.world.apply(
    { type: 'canvas', children: data },
    { mergeStrategy: 'replace', validateSchema: false },
  );
};

const destroyChildren = (parent) => {
  const children = [...parent.children];
  for (const child of children) {
    child.destroy({ children: true });
  }
  parent.props.children = [];
};

const resetElementIndex = (store) => {
  const targetStore = store.world?.store ?? store;
  targetStore.sceneIndex = new SceneIndex();
  targetStore.elementById = targetStore.sceneIndex.elementById;
};
