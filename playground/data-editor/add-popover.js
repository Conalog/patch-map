export const createAddPopover = ({
  patchmap,
  elements,
  state,
  validateNode,
  setCurrentData,
  selectNodeById,
  updateSelection,
  setEditorError,
  clearEditorError,
  setLastAction,
}) => {
  const updateAddParentOptions = () => {
    if (!elements.dataAddParent) return;
    const previous = elements.dataAddParent.value;
    const options = buildAddParentOptions();
    elements.dataAddParent.replaceChildren(
      ...options.map((option) => {
        const item = document.createElement('option');
        item.value = option.value;
        item.textContent = option.label;
        return item;
      }),
    );

    const preferred = resolveAddParentSelection(
      previous,
      state.selectedNodeId,
      options,
    );
    elements.dataAddParent.value = preferred;
    updateAddTypeOptions();
  };

  const openAddPopover = (parentId = '__root__') => {
    if (!elements.dataPopover) return;
    updateAddParentOptions();
    if (elements.dataAddParent) {
      const target = parentId ?? '__root__';
      const optionExists = Array.from(elements.dataAddParent.options).some(
        (option) => option.value === target,
      );
      elements.dataAddParent.value = optionExists ? target : '__root__';
      updateAddTypeOptions();
    }
    elements.dataPopover.hidden = false;
    elements.dataAddId?.focus();
  };

  const closeAddPopover = () => {
    if (!elements.dataPopover) return;
    elements.dataPopover.hidden = true;
  };

  const updateAddTypeOptions = () => {
    if (!elements.dataAddType || !elements.dataAddParent) return;
    const previous = elements.dataAddType.value;
    const parentEntry = state.nodeIndex.get(elements.dataAddParent.value);
    const parentType = parentEntry?.node?.type;
    const types =
      parentType === 'item' || parentType === 'grid'
        ? ['background', 'bar', 'icon', 'text']
        : ['group', 'grid', 'item', 'relations'];

    elements.dataAddType.replaceChildren(
      ...types.map((type) => {
        const option = document.createElement('option');
        option.value = type;
        option.textContent = type;
        return option;
      }),
    );

    if (types.includes(previous)) {
      elements.dataAddType.value = previous;
    }
  };

  const handleAddElement = () => {
    if (!elements.dataAddType || !elements.dataAddParent) return;
    const parentId = elements.dataAddParent.value;
    const type = elements.dataAddType.value;
    const idInput = elements.dataAddId?.value.trim();
    const labelInput = elements.dataAddLabel?.value.trim();
    const id = idInput || generateId(type);

    if (state.nodeIndex.has(id)) {
      setEditorError(`Duplicate id: ${id}`);
      return;
    }

    const node = buildNewNode(type, id, labelInput);
    if (!node) {
      setEditorError('Unsupported type');
      return;
    }

    const validation = validateNode(node, type);
    if (!validation.success) {
      setEditorError(validation.message);
      return;
    }

    if (parentId === '__root__') {
      state.currentData.push(node);
    } else {
      const parentEntry = state.nodeIndex.get(parentId);
      if (!parentEntry?.node) {
        setEditorError('Invalid parent');
        return;
      }
      if (parentEntry.node.type === 'item') {
        parentEntry.node.components = parentEntry.node.components ?? [];
        parentEntry.node.components.push(node);
      } else if (parentEntry.node.type === 'grid') {
        parentEntry.node.item = parentEntry.node.item ?? {
          size: { width: 40, height: 80 },
          padding: 0,
          components: [],
        };
        parentEntry.node.item.components =
          parentEntry.node.item.components ?? [];
        parentEntry.node.item.components.push(node);
      } else {
        parentEntry.node.children = parentEntry.node.children ?? [];
        parentEntry.node.children.push(node);
      }
    }

    clearEditorError();
    if (elements.dataAddId) elements.dataAddId.value = '';
    if (elements.dataAddLabel) elements.dataAddLabel.value = '';

    patchmap.draw(state.currentData);
    patchmap.fit();
    setCurrentData(state.currentData);
    selectNodeById(id);
    setLastAction(`Added ${id}`);
    closeAddPopover();
  };

  const deleteNodeById = (nodeId) => {
    if (!nodeId) return;
    const entry = state.nodeIndex.get(nodeId);
    if (!entry) return;

    const { parentId } = entry;
    let removed = false;
    if (!parentId) {
      const index = state.currentData.findIndex((node) => node.id === nodeId);
      if (index >= 0) {
        state.currentData.splice(index, 1);
        removed = true;
      }
    } else {
      const parentEntry = state.nodeIndex.get(parentId);
      if (parentEntry?.node) {
        if (parentEntry.node.type === 'item') {
          parentEntry.node.components = (
            parentEntry.node.components ?? []
          ).filter((child) => child.id !== nodeId);
          removed = true;
        } else if (parentEntry.node.type === 'grid') {
          parentEntry.node.item = parentEntry.node.item ?? {
            size: { width: 40, height: 80 },
            padding: 0,
            components: [],
          };
          parentEntry.node.item.components = (
            parentEntry.node.item.components ?? []
          ).filter((child) => child.id !== nodeId);
          removed = true;
        } else {
          parentEntry.node.children = (parentEntry.node.children ?? []).filter(
            (child) => child.id !== nodeId,
          );
          removed = true;
        }
      }
    }

    if (!removed) return;

    patchmap.draw(state.currentData);
    patchmap.fit();
    setCurrentData(state.currentData);
    updateSelection(null);
    setLastAction(`Deleted ${nodeId}`);
  };

  return {
    updateAddParentOptions,
    openAddPopover,
    closeAddPopover,
    updateAddTypeOptions,
    handleAddElement,
    deleteNodeById,
  };

  function buildAddParentOptions() {
    const options = [{ value: '__root__', label: 'Root' }];
    state.nodeIndex.forEach((entry, entryId) => {
      const type = entry.node?.type;
      if (type === 'group' || type === 'item' || type === 'grid') {
        options.push({ value: entryId, label: `${type}:${entryId}` });
      }
    });
    return options;
  }

  function generateId(type) {
    const base = type.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    let candidate = `${base}-${Math.random().toString(36).slice(2, 6)}`;
    while (state.nodeIndex.has(candidate)) {
      candidate = `${base}-${Math.random().toString(36).slice(2, 6)}`;
    }
    return candidate;
  }
};

const resolveAddParentSelection = (previous, selectedId, options) => {
  const values = new Set(options.map((option) => option.value));
  if (previous && values.has(previous)) return previous;
  if (selectedId && values.has(selectedId)) return selectedId;
  return '__root__';
};
const buildNewNode = (type, id, label) => {
  const base = { type, id };
  if (label) {
    base.label = label;
  }

  switch (type) {
    case 'group':
      return { ...base, children: [] };
    case 'grid':
      return {
        ...base,
        cells: [[1]],
        gap: 4,
        item: {
          size: { width: 40, height: 80 },
          padding: 6,
          components: [
            {
              type: 'background',
              source: {
                type: 'rect',
                fill: '#ffffff',
                borderWidth: 1,
                borderColor: '#111111',
                radius: 4,
              },
              tint: '#ffffff',
            },
          ],
        },
      };
    case 'item':
      return {
        ...base,
        size: { width: 120, height: 80 },
        padding: 0,
        components: [],
      };
    case 'relations':
      return { ...base, links: [], style: { width: 2 } };
    case 'background':
      return {
        ...base,
        source: {
          type: 'rect',
          fill: '#ffffff',
          borderWidth: 1,
          borderColor: '#111111',
          radius: 4,
        },
        tint: '#ffffff',
      };
    case 'bar':
      return {
        ...base,
        source: { type: 'rect', fill: '#111111', radius: 4 },
        size: { width: '50%', height: 10 },
        placement: 'bottom',
        margin: 0,
        tint: '#111111',
      };
    case 'icon':
      return {
        ...base,
        source: 'wifi',
        size: 16,
        placement: 'center',
        margin: 0,
        tint: '#111111',
      };
    case 'text':
      return {
        ...base,
        text: 'Label',
        style: {},
        placement: 'center',
        margin: 0,
        tint: '#111111',
      };
    default:
      return null;
  }
};
