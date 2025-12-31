export const createRelationsEditor = ({
  patchmap,
  state,
  componentTypes,
  validateNode,
  setEditorValue,
  setEditorError,
  clearEditorError,
  setLastAction,
}) => {
  const renderRelationsEditor = (container, node, id) => {
    const editor = document.createElement('div');
    editor.className = 'relations-editor';

    const title = document.createElement('div');
    title.className = 'relations-title';
    title.textContent = 'Links';

    const controls = document.createElement('div');
    controls.className = 'relations-controls';

    const sourceSelect = document.createElement('select');
    sourceSelect.className = 'relations-select';
    const targetSelect = document.createElement('select');
    targetSelect.className = 'relations-select';

    const options = buildRelationsOptions();
    options.forEach((option) => {
      const sourceOption = document.createElement('option');
      sourceOption.value = option.value;
      sourceOption.textContent = option.label;
      sourceSelect.append(sourceOption);

      const targetOption = document.createElement('option');
      targetOption.value = option.value;
      targetOption.textContent = option.label;
      targetSelect.append(targetOption);
    });

    if (options.length > 1) {
      targetSelect.selectedIndex = 1;
    }

    const addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.className = 'relations-add';
    addButton.textContent = 'Add';

    controls.append(sourceSelect, targetSelect, addButton);

    const list = document.createElement('div');
    list.className = 'relations-list';

    const renderList = () => {
      list.replaceChildren();
      const links = node.links ?? [];
      if (links.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'relations-empty';
        empty.textContent = 'No links';
        list.append(empty);
        return;
      }
      links.forEach((link, index) => {
        const row = document.createElement('div');
        row.className = 'relations-row';

        const label = document.createElement('div');
        label.className = 'relations-label';
        label.textContent = `${link.source} → ${link.target}`;

        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.className = 'relations-delete';
        removeButton.textContent = '−';
        removeButton.addEventListener('click', () => {
          const nextLinks = node.links.filter((_, idx) => idx !== index);
          applyRelationsLinks(node, id, nextLinks);
          renderList();
        });

        row.append(label, removeButton);
        list.append(row);
      });
    };

    addButton.addEventListener('click', () => {
      const source = sourceSelect.value;
      const target = targetSelect.value;
      if (!source || !target) return;
      const nextLinks = [...(node.links ?? [])];
      if (
        nextLinks.some(
          (link) => link.source === source && link.target === target,
        )
      ) {
        return;
      }
      nextLinks.push({ source, target });
      applyRelationsLinks(node, id, nextLinks);
      renderList();
    });

    renderList();
    editor.append(title, controls, list);
    container.append(editor);
  };

  const applyRelationsLinks = (node, id, nextLinks) => {
    const draft = { ...node, links: nextLinks };
    const validation = validateNode(draft, node.type);
    if (!validation.success) {
      setEditorError(validation.message);
      return;
    }

    node.links = nextLinks;
    patchmap.update({
      path: `$..[?(@.id=="${id}")]`,
      changes: { links: nextLinks },
      mergeStrategy: 'replace',
    });
    setEditorValue(state.currentData);
    clearEditorError();
    setLastAction(`Updated ${id} links`);
  };

  const buildRelationsOptions = () => {
    const options = [];
    state.nodeIndex.forEach((entry, entryId) => {
      const type = entry.node?.type;
      if (!type || componentTypes.has(type)) return;
      options.push({ value: entryId, label: entryId });
      if (type === 'grid' && Array.isArray(entry.node.cells)) {
        entry.node.cells.forEach((row, rowIndex) => {
          row.forEach((cell, colIndex) => {
            if (cell === 0 || cell == null) return;
            options.push({
              value: `${entryId}.${rowIndex}.${colIndex}`,
              label: `${entryId}.${rowIndex}.${colIndex}`,
            });
          });
        });
      }
    });
    return options;
  };

  return { renderRelationsEditor };
};
