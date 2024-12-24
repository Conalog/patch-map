export const findContainers = (viewport, group = null) => {
  const results = [];
  traverse(viewport);
  return results;

  function traverse(container) {
    for (const child of container.children) {
      if (child.type === 'container') {
        if (!group || child.group === group) {
          results.push(child);
        }
        traverse(child);
      }
    }
  }
};

export const findContainer = (viewport, id) => {
  let result = null;
  traverse(viewport);
  return result;

  function traverse(container) {
    for (const child of container.children) {
      if (child.type === 'container') {
        if (child.id === id) {
          result = child;
          return;
        }
        traverse(child);
        if (result) return;
      }
    }
  }
};

export const findComponent = (viewport, type, id) => {
  const containers = findContainers(viewport);
  for (const container of containers) {
    const find = container.children.find(
      (child) => child.type === type && child.id === id,
    );
    if (find) {
      return find;
    }
  }
  return null;
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
