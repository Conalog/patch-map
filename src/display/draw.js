import { LogicalSceneIndex } from './model/LogicalSceneIndex';
import { SceneIndex } from './model/SceneIndex';
import { primePanelComponentCache } from './renderers/panelComponentRenderer';

export const draw = (store, data) => {
  resetElementIndex(store);
  destroyChildren(store.world);
  store.world.apply(
    { type: 'canvas', children: data },
    { mergeStrategy: 'replace', validateSchema: false },
  );
  primePanelCaches(store);
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
  targetStore.modelIndex = new LogicalSceneIndex();
  targetStore.elementById = targetStore.sceneIndex.elementById;
};

const primePanelCaches = (store) => {
  const targetStore = store.world?.store ?? store;
  const items = targetStore.sceneIndex?.byType?.get('item');
  if (!items) return;
  for (const item of items) {
    primePanelComponentCache(item, { materializeHiddenBar: true });
  }
};
