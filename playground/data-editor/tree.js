export const createTree = ({ elements, state, updateAddParentOptions }) => {
  const renderTree = () => {
    if (!elements.dataTree) return;
    elements.dataTree.replaceChildren();
    state.nodeIndex = new Map();
    state.treeItemById = new Map();
    if (!Array.isArray(state.currentData)) return;

    const fragment = document.createDocumentFragment();
    const walk = (nodes, depth = 0, parentId = null) => {
      nodes.forEach((node) => {
        if (!node || !node.id) return;
        if (state.nodeIndex.has(node.id)) {
          return;
        }
        state.nodeIndex.set(node.id, { node, parentId, depth });

        const row = document.createElement('div');
        row.className = 'tree-row';
        row.style.paddingLeft = `${6 + depth * 12}px`;

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'tree-label';
        button.dataset.nodeId = node.id;

        const label = document.createElement('span');
        label.className = 'tree-id';
        label.textContent = node.id;
        const type = document.createElement('span');
        type.className = 'tree-type';
        type.textContent = node.type ?? 'node';

        button.append(label, type);
        if (node.id === state.selectedNodeId) {
          button.classList.add('is-active');
        }

        const actions = document.createElement('div');
        actions.className = 'tree-actions';

        const addButton = document.createElement('button');
        addButton.type = 'button';
        addButton.className = 'tree-action';
        addButton.dataset.action = 'add';
        addButton.dataset.parentId =
          node.type === 'grid' || node.type === 'item'
            ? node.id
            : (parentId ?? '__root__');
        addButton.textContent = '+';

        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className = 'tree-action';
        deleteButton.dataset.action = 'delete';
        deleteButton.dataset.nodeId = node.id;
        deleteButton.textContent = '−';

        actions.append(addButton, deleteButton);
        row.append(button, actions);

        state.treeItemById.set(node.id, button);
        fragment.append(row);

        if (Array.isArray(node.children)) {
          walk(node.children, depth + 1, node.id);
        }
        if (node.type === 'item' && Array.isArray(node.components)) {
          walk(node.components, depth + 1, node.id);
        }
        if (node.type === 'grid' && Array.isArray(node.item?.components)) {
          walk(node.item.components, depth + 1, node.id);
        }
      });
    };

    walk(state.currentData);
    fragment.append(buildRootAddRow());
    elements.dataTree.append(fragment);
    updateAddParentOptions?.();
  };

  const highlightTree = (id) => {
    state.treeItemById.forEach((item) => item.classList.remove('is-active'));
    if (!id) return;
    const target = state.treeItemById.get(id);
    if (target) {
      target.classList.add('is-active');
    }
  };

  return { renderTree, highlightTree };
};

const buildRootAddRow = () => {
  const row = document.createElement('div');
  row.className = 'tree-row';

  const label = document.createElement('div');
  label.className = 'tree-root-label';
  label.textContent = 'Root';

  const actions = document.createElement('div');
  actions.className = 'tree-actions';

  const addButton = document.createElement('button');
  addButton.type = 'button';
  addButton.className = 'tree-action';
  addButton.dataset.action = 'add';
  addButton.dataset.parentId = '__root__';
  addButton.textContent = '+';

  actions.append(addButton);
  row.append(label, actions);
  return row;
};
