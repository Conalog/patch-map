import { Container } from 'pixi.js';

export const findContainers = (viewport, type = null) => {
  let containers = [];
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

export const findComponents = (type, containers = []) => {
  const components = [];
  for (const container of containers) {
    const finds = container.children.filter((child) => child.type === type);
    if (finds.length > 0) {
      components.push(...finds);
    }
  }
  return components;
};
