import { Container } from 'pixi.js';

export const findAssetComponents = (name, containers = []) => {
  const assetComponents = [];
  for (const container of containers) {
    const result = container.children.filter(
      (child) => child.assetName === name,
    );
    if (result) {
      assetComponents.push(...result);
    }
  }
  return assetComponents;
};

export const findComponents = (id = '', containers = []) => {
  const componentMap = {};
  for (const container of containers) {
    const components = container.children.filter((child) => child.label === id);
    if (components.length > 0) {
      components.forEach((component) => {
        componentMap[component.assetName] = component;
      });
      break;
    }
  }
  return componentMap;
};

export const findContainers = (viewport, type = null) => {
  let containers = null;
  if (type) {
    containers = viewport.children.filter((child) => child.type === type);
  } else {
    containers = viewport.children.filter(
      (child) => child instanceof Container,
    );
  }
  return containers;
};

export const findContainer = (viewport, id) => {
  return viewport.children.find((child) => child.id === id) ?? null;
};
