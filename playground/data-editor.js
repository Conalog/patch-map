import { componentSchema } from '../src/display/data-schema/component-schema.js';
import { elementTypes } from '../src/display/data-schema/element-schema.js';

const componentTypes = new Set(['background', 'bar', 'icon', 'text']);
const colorPresets = [
  { value: 'primary.default', label: 'primary.default' },
  { value: 'primary.dark', label: 'primary.dark' },
  { value: 'primary.accent', label: 'primary.accent' },
  { value: 'gray.dark', label: 'gray.dark' },
  { value: 'gray.light', label: 'gray.light' },
  { value: 'black', label: 'black' },
  { value: 'white', label: 'white' },
  { value: '#111111', label: '#111111' },
  { value: '#ffffff', label: '#ffffff' },
];
const colorPresetValues = new Set(colorPresets.map((preset) => preset.value));

export const createDataEditor = ({ patchmap, elements, setLastAction }) => {
  let currentData = [];
  let nodeIndex = new Map();
  let treeItemById = new Map();
  let selectedNodeId = null;

  const setDataMode = (mode) => {
    const isJson = mode === 'json';
    elements.dataJsonView.hidden = !isJson;
    elements.dataFormView.hidden = isJson;
    elements.dataModeJson.classList.toggle('is-active', isJson);
    elements.dataModeForm.classList.toggle('is-active', !isJson);
    elements.dataModeJson.setAttribute('aria-selected', String(isJson));
    elements.dataModeForm.setAttribute('aria-selected', String(!isJson));
    if (isJson) {
      closeAddPopover();
    }
    if (!isJson) {
      renderTree();
      renderInspector(selectedNodeId);
    }
  };

  const setCurrentData = (data, { updateEditor = true } = {}) => {
    currentData = data;
    if (updateEditor) {
      setEditorValue(data);
    }
    renderTree();
    renderInspector(selectedNodeId);
  };

  const updateSelection = (target, fallbackId = null) => {
    const id = target?.id ?? fallbackId ?? null;
    selectedNodeId = id;
    elements.selectedId.textContent = id ?? 'None';
    if (patchmap.transformer) {
      patchmap.transformer.elements = target ? [target] : [];
    }
    highlightTree(id);
    renderInspector(id);
    updateAddParentOptions();
  };

  const getSelectedNodeId = () => selectedNodeId;

  const applyEditorData = () => {
    const data = parseEditorValue();
    if (!data) return;
    if (!Array.isArray(data)) {
      setEditorError('Root must be an array of elements.');
      return;
    }

    try {
      patchmap.draw(data);
      patchmap.fit();
      setCurrentData(data, { updateEditor: false });
      updateSelection(null);
      clearEditorError();
      setLastAction('Applied editor data');
    } catch (error) {
      setEditorError(formatError(error));
    }
  };

  const prettifyEditor = () => {
    const data = parseEditorValue();
    if (!data) return;
    setEditorValue(data);
    clearEditorError();
    setLastAction('Prettified editor');
  };

  const selectNodeById = (id) => {
    if (!id) return;
    const target = patchmap.selector(`$..[?(@.id=="${id}")]`)[0];
    updateSelection(target, id);
  };

  const renderTree = () => {
    if (!elements.dataTree) return;
    elements.dataTree.replaceChildren();
    nodeIndex = new Map();
    treeItemById = new Map();
    if (!Array.isArray(currentData)) return;

    const fragment = document.createDocumentFragment();
    const walk = (nodes, depth = 0, parentId = null) => {
      nodes.forEach((node) => {
        if (!node || !node.id) return;
        if (nodeIndex.has(node.id)) {
          return;
        }
        nodeIndex.set(node.id, { node, parentId, depth });

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
        if (node.id === selectedNodeId) {
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

        treeItemById.set(node.id, button);
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

    walk(currentData);
    fragment.append(buildRootAddRow());
    elements.dataTree.append(fragment);
    updateAddParentOptions();
  };

  const highlightTree = (id) => {
    treeItemById.forEach((item) => item.classList.remove('is-active'));
    if (!id) return;
    const target = treeItemById.get(id);
    if (target) {
      target.classList.add('is-active');
    }
  };

  const renderInspector = (id) => {
    const container = elements.inspectorContent ?? elements.dataInspector;
    if (!container) return;
    container.replaceChildren();

    if (!id) {
      container.append(buildInspectorEmpty('Select a node'));
      return;
    }

    const entry = nodeIndex.get(id);
    if (!entry) {
      container.append(buildInspectorEmpty('No editable data'));
      return;
    }

    const { node } = entry;
    const resolved = resolveNodeSchema(node);
    const data = resolved.parsed ?? node;
    const buildInput = (value, options = {}) => {
      let input;
      if (options.options) {
        input = document.createElement('select');
        options.options.forEach((option) => {
          const item = document.createElement('option');
          item.value = option.value;
          item.textContent = option.label;
          input.append(item);
        });
        if (value != null) {
          input.value = String(value);
        }
      } else if (options.type === 'boolean') {
        input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = Boolean(value);
      } else {
        input = document.createElement('input');
        input.type = options.type ?? 'text';
        input.value = value ?? '';
      }

      input.className = 'inspector-input';
      if (options.compact) {
        input.classList.add('inspector-input--compact');
      }

      if (options.readOnly) {
        input.readOnly = true;
      } else if (options.path) {
        input.addEventListener('change', (event) => {
          const nextValue =
            options.type === 'boolean'
              ? event.target.checked
              : event.target.value;
          handleInspectorChange(
            id,
            node,
            options.path,
            nextValue,
            options.type,
            options.originalValue,
          );
        });
      }
      return input;
    };

    const addField = (label, value, options = {}) => {
      const field = document.createElement('div');
      field.className = 'inspector-field';

      const labelEl = document.createElement('div');
      labelEl.className = 'inspector-label';
      labelEl.textContent = label;

      const input = buildInput(value, options);
      field.append(labelEl, input);
      container.append(field);
    };

    const addInlineFields = (label, fields) => {
      const field = document.createElement('div');
      field.className = 'inspector-field inspector-field--inline';

      const labelEl = document.createElement('div');
      labelEl.className = 'inspector-label';
      labelEl.textContent = label;

      const group = document.createElement('div');
      group.className = 'inspector-inline';

      fields.forEach((item) => {
        const wrap = document.createElement('div');
        wrap.className = 'inspector-inline-item';

        const tag = document.createElement('div');
        tag.className = 'inspector-inline-label';
        tag.textContent = item.short;

        const input = buildInput(item.value, {
          ...item.options,
          path: item.path,
          type: item.type,
          originalValue: item.originalValue,
          compact: true,
        });

        wrap.append(tag, input);
        group.append(wrap);
      });

      field.append(labelEl, group);
      container.append(field);
    };

    const addColorField = (label, value, path) => {
      const field = document.createElement('div');
      field.className = 'inspector-field inspector-field--inline';

      const labelEl = document.createElement('div');
      labelEl.className = 'inspector-label';
      labelEl.textContent = label;

      const group = document.createElement('div');
      group.className = 'inspector-inline';

      const select = document.createElement('select');
      select.className =
        'inspector-input inspector-input--compact color-select';

      const customOption = document.createElement('option');
      customOption.value = '__custom__';
      customOption.textContent = 'Custom';
      select.append(customOption);

      colorPresets.forEach((preset) => {
        const option = document.createElement('option');
        option.value = preset.value;
        option.textContent = preset.label;
        select.append(option);
      });

      const stringValue = value == null ? '' : String(value);
      select.value = colorPresetValues.has(stringValue)
        ? stringValue
        : '__custom__';

      const input = document.createElement('input');
      input.className = 'inspector-input color-input';
      input.type = 'text';
      input.value = stringValue;
      input.placeholder = '#ffffff';

      select.addEventListener('change', () => {
        if (select.value === '__custom__') {
          input.focus();
          return;
        }
        input.value = select.value;
        handleInspectorChange(id, node, path, select.value, 'text', value);
      });

      input.addEventListener('change', (event) => {
        const nextValue = event.target.value;
        select.value = colorPresetValues.has(nextValue)
          ? nextValue
          : '__custom__';
        handleInspectorChange(id, node, path, nextValue, 'text', value);
      });

      group.append(select, input);
      field.append(labelEl, group);
      container.append(field);
    };

    addField('Id', data.id, { readOnly: true });
    addField('Type', data.type ?? '', { readOnly: true });
    addField('Label', data.label ?? '', { path: 'label', type: 'text' });
    addField('Show', data.show ?? true, { path: 'show', type: 'boolean' });

    if (typeof data.text === 'string') {
      addField('Text', data.text, { path: 'text', type: 'text' });
    }

    if (typeof data.source === 'string') {
      addField('Source', data.source, { path: 'source', type: 'text' });
    }

    if (data.tint != null) {
      addColorField('Tint', data.tint, 'tint');
    }

    if (data.type !== 'relations' && resolved.kind === 'element') {
      addField('X', data.attrs?.x ?? '', {
        path: 'attrs.x',
        type: 'number',
        originalValue: data.attrs?.x,
      });
      addField('Y', data.attrs?.y ?? '', {
        path: 'attrs.y',
        type: 'number',
        originalValue: data.attrs?.y,
      });
      if (data.attrs?.angle != null) {
        addField('Angle', data.attrs.angle ?? '', {
          path: 'attrs.angle',
          type: 'number',
          originalValue: data.attrs?.angle,
        });
      }
      if (data.attrs?.rotation != null) {
        addField('Rot', data.attrs.rotation ?? '', {
          path: 'attrs.rotation',
          type: 'number',
          originalValue: data.attrs?.rotation,
        });
      }
    }

    if (data.size != null) {
      if (resolved.kind === 'component') {
        const widthValue = formatPxPercent(data.size?.width);
        const heightValue = formatPxPercent(data.size?.height);
        addInlineFields('Size', [
          {
            short: 'W',
            value: widthValue ?? '',
            path: 'size.width',
            type: 'text',
          },
          {
            short: 'H',
            value: heightValue ?? '',
            path: 'size.height',
            type: 'text',
          },
        ]);
      } else {
        addInlineFields('Size', [
          {
            short: 'W',
            value: data.size?.width ?? '',
            path: 'size.width',
            type: 'number',
            originalValue: data.size?.width,
          },
          {
            short: 'H',
            value: data.size?.height ?? '',
            path: 'size.height',
            type: 'number',
            originalValue: data.size?.height,
          },
        ]);
      }
    }

    if (data.gap != null) {
      addInlineFields('Gap', [
        {
          short: 'X',
          value: data.gap?.x ?? '',
          path: 'gap.x',
          type: 'number',
          originalValue: data.gap?.x,
        },
        {
          short: 'Y',
          value: data.gap?.y ?? '',
          path: 'gap.y',
          type: 'number',
          originalValue: data.gap?.y,
        },
      ]);
    }

    if (data.padding != null && resolved.kind === 'element') {
      addInlineFields('Pad', [
        {
          short: 'T',
          value: data.padding?.top ?? '',
          path: 'padding.top',
          type: 'number',
          originalValue: data.padding?.top,
        },
        {
          short: 'R',
          value: data.padding?.right ?? '',
          path: 'padding.right',
          type: 'number',
          originalValue: data.padding?.right,
        },
        {
          short: 'B',
          value: data.padding?.bottom ?? '',
          path: 'padding.bottom',
          type: 'number',
          originalValue: data.padding?.bottom,
        },
        {
          short: 'L',
          value: data.padding?.left ?? '',
          path: 'padding.left',
          type: 'number',
          originalValue: data.padding?.left,
        },
      ]);
    }

    if (data.placement && resolved.kind === 'component') {
      addField('Place', data.placement, {
        path: 'placement',
        type: 'text',
        options: [
          { value: 'left', label: 'left' },
          { value: 'left-top', label: 'left-top' },
          { value: 'left-bottom', label: 'left-bottom' },
          { value: 'top', label: 'top' },
          { value: 'right', label: 'right' },
          { value: 'right-top', label: 'right-top' },
          { value: 'right-bottom', label: 'right-bottom' },
          { value: 'bottom', label: 'bottom' },
          { value: 'center', label: 'center' },
        ],
      });
    }

    if (data.margin && resolved.kind === 'component') {
      addInlineFields('Margin', [
        {
          short: 'T',
          value: data.margin?.top ?? '',
          path: 'margin.top',
          type: 'number',
          originalValue: data.margin?.top,
        },
        {
          short: 'R',
          value: data.margin?.right ?? '',
          path: 'margin.right',
          type: 'number',
          originalValue: data.margin?.right,
        },
        {
          short: 'B',
          value: data.margin?.bottom ?? '',
          path: 'margin.bottom',
          type: 'number',
          originalValue: data.margin?.bottom,
        },
        {
          short: 'L',
          value: data.margin?.left ?? '',
          path: 'margin.left',
          type: 'number',
          originalValue: data.margin?.left,
        },
      ]);
    }

    if (
      (data.type === 'background' || data.type === 'bar') &&
      data.source &&
      typeof data.source === 'object'
    ) {
      addColorField('Fill', data.source.fill ?? '', 'source.fill');
      addColorField(
        'Border',
        data.source.borderColor ?? '',
        'source.borderColor',
      );
      addField('B Width', data.source.borderWidth ?? '', {
        path: 'source.borderWidth',
        type: 'number',
        originalValue: data.source.borderWidth,
      });
      if (typeof data.source.radius === 'number') {
        addField('Radius', data.source.radius ?? '', {
          path: 'source.radius',
          type: 'number',
          originalValue: data.source.radius,
        });
      } else if (data.source.radius && typeof data.source.radius === 'object') {
        addInlineFields('Radius', [
          {
            short: 'TL',
            value: data.source.radius.topLeft ?? '',
            path: 'source.radius.topLeft',
            type: 'number',
            originalValue: data.source.radius.topLeft,
          },
          {
            short: 'TR',
            value: data.source.radius.topRight ?? '',
            path: 'source.radius.topRight',
            type: 'number',
            originalValue: data.source.radius.topRight,
          },
          {
            short: 'BR',
            value: data.source.radius.bottomRight ?? '',
            path: 'source.radius.bottomRight',
            type: 'number',
            originalValue: data.source.radius.bottomRight,
          },
          {
            short: 'BL',
            value: data.source.radius.bottomLeft ?? '',
            path: 'source.radius.bottomLeft',
            type: 'number',
            originalValue: data.source.radius.bottomLeft,
          },
        ]);
      }
    }

    if (data.type === 'relations' && data.style?.color != null) {
      addColorField('Color', data.style.color ?? '', 'style.color');
    }

    if (data.type === 'relations' && data.style?.width != null) {
      addField('Width', data.style.width ?? '', {
        path: 'style.width',
        type: 'number',
        originalValue: data.style.width,
      });
    }

    if (data.type === 'text') {
      addField('Split', data.split ?? '', {
        path: 'split',
        type: 'number',
        originalValue: data.split,
      });
      addField('F Size', data.style?.fontSize ?? '', {
        path: 'style.fontSize',
        type: 'text',
      });
      addField('F Weight', data.style?.fontWeight ?? '', {
        path: 'style.fontWeight',
        type: 'text',
      });
      addField('F Family', data.style?.fontFamily ?? '', {
        path: 'style.fontFamily',
        type: 'text',
      });
      addColorField('Fill', data.style?.fill ?? '', 'style.fill');
      addField('Wrap', data.style?.wordWrapWidth ?? '', {
        path: 'style.wordWrapWidth',
        type: 'text',
      });
      addField('Overflow', data.style?.overflow ?? '', {
        path: 'style.overflow',
        type: 'text',
        options: [
          { value: 'visible', label: 'visible' },
          { value: 'hidden', label: 'hidden' },
          { value: 'ellipsis', label: 'ellipsis' },
        ],
      });
      addInlineFields('Auto', [
        {
          short: 'Min',
          value: data.style?.autoFont?.min ?? '',
          path: 'style.autoFont.min',
          type: 'number',
          originalValue: data.style?.autoFont?.min,
        },
        {
          short: 'Max',
          value: data.style?.autoFont?.max ?? '',
          path: 'style.autoFont.max',
          type: 'number',
          originalValue: data.style?.autoFont?.max,
        },
      ]);
    }

    if (data.type === 'bar') {
      addField('Anim', data.animation ?? true, {
        path: 'animation',
        type: 'boolean',
      });
      addField('Anim Ms', data.animationDuration ?? '', {
        path: 'animationDuration',
        type: 'number',
        originalValue: data.animationDuration,
      });
    }

    if (data.type === 'grid') {
      addInlineFields('Item Size', [
        {
          short: 'W',
          value: data.item?.size?.width ?? '',
          path: 'item.size.width',
          type: 'number',
          originalValue: data.item?.size?.width,
        },
        {
          short: 'H',
          value: data.item?.size?.height ?? '',
          path: 'item.size.height',
          type: 'number',
          originalValue: data.item?.size?.height,
        },
      ]);
      addInlineFields('Item Pad', [
        {
          short: 'T',
          value: data.item?.padding?.top ?? '',
          path: 'item.padding.top',
          type: 'number',
          originalValue: data.item?.padding?.top,
        },
        {
          short: 'R',
          value: data.item?.padding?.right ?? '',
          path: 'item.padding.right',
          type: 'number',
          originalValue: data.item?.padding?.right,
        },
        {
          short: 'B',
          value: data.item?.padding?.bottom ?? '',
          path: 'item.padding.bottom',
          type: 'number',
          originalValue: data.item?.padding?.bottom,
        },
        {
          short: 'L',
          value: data.item?.padding?.left ?? '',
          path: 'item.padding.left',
          type: 'number',
          originalValue: data.item?.padding?.left,
        },
      ]);
    }

    if (data.type === 'relations') {
      renderRelationsEditor(container, node, id);
    }

    if (data.type === 'grid') {
      renderGridEditor(container, node, id);
    }
  };

  const buildInspectorEmpty = (text) => {
    const empty = document.createElement('div');
    empty.className = 'inspector-empty';
    empty.textContent = text;
    return empty;
  };

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
    setEditorValue(currentData);
    clearEditorError();
    setLastAction(`Updated ${id} links`);
  };

  const buildRelationsOptions = () => {
    const options = [];
    nodeIndex.forEach((entry, id) => {
      const type = entry.node?.type;
      if (!type || componentTypes.has(type)) return;
      options.push({ value: id, label: id });
      if (type === 'grid' && Array.isArray(entry.node.cells)) {
        entry.node.cells.forEach((row, rowIndex) => {
          row.forEach((cell, colIndex) => {
            if (cell === 0 || cell == null) return;
            options.push({
              value: `${id}.${rowIndex}.${colIndex}`,
              label: `${id}.${rowIndex}.${colIndex}`,
            });
          });
        });
      }
    });
    return options;
  };

  const renderGridEditor = (container, node, id) => {
    if (!Array.isArray(node.cells)) return;
    const editor = document.createElement('div');
    editor.className = 'grid-editor';

    const title = document.createElement('div');
    title.className = 'grid-title';
    title.textContent = 'Cells';

    const controls = document.createElement('div');
    controls.className = 'grid-controls';

    const addRow = buildGridControl('+ Row', 'add-row');
    const removeRow = buildGridControl('- Row', 'remove-row');
    const addCol = buildGridControl('+ Col', 'add-col');
    const removeCol = buildGridControl('- Col', 'remove-col');

    controls.append(addRow, removeRow, addCol, removeCol);

    const grid = document.createElement('div');
    grid.className = 'grid-cells';

    const renderCells = () => {
      grid.replaceChildren();
      const rows = node.cells.length;
      const cols = Math.max(1, ...node.cells.map((row) => row.length || 0));
      grid.style.setProperty('--grid-cols', String(cols));
      grid.style.setProperty('--grid-rows', String(rows));

      node.cells.forEach((row, rowIndex) => {
        for (let colIndex = 0; colIndex < cols; colIndex += 1) {
          const value = row[colIndex];
          const cell = document.createElement('button');
          cell.type = 'button';
          cell.className = 'grid-cell';
          cell.dataset.row = String(rowIndex);
          cell.dataset.col = String(colIndex);

          if (typeof value === 'string') {
            cell.dataset.original = value;
            cell.dataset.value = value;
          }

          if (value !== 0 && value !== undefined) {
            cell.classList.add('is-active');
          }

          cell.textContent = '';
          grid.append(cell);
        }
      });
    };

    const updateCells = (nextCells) => {
      node.cells = nextCells;
      patchmap.update({
        path: `$..[?(@.id=="${id}")]`,
        changes: { cells: nextCells },
        mergeStrategy: 'replace',
      });
      setEditorValue(currentData);
      clearEditorError();
    };

    editor.addEventListener('click', (event) => {
      const actionButton = event.target.closest('[data-grid-action]');
      if (actionButton) {
        const action = actionButton.dataset.gridAction;
        const cols = Math.max(1, ...node.cells.map((row) => row.length || 0));
        if (action === 'add-row') {
          node.cells.push(Array.from({ length: cols }, () => 1));
        }
        if (action === 'remove-row' && node.cells.length > 1) {
          node.cells.pop();
        }
        if (action === 'add-col') {
          node.cells.forEach((row) => row.push(1));
        }
        if (action === 'remove-col' && cols > 1) {
          node.cells.forEach((row) => row.pop());
        }
        updateCells(node.cells);
        renderCells();
        setLastAction(`Updated ${id} cells`);
        return;
      }

      const cell = event.target.closest('.grid-cell');
      if (!cell) return;
      const row = Number(cell.dataset.row);
      const col = Number(cell.dataset.col);
      const currentValue = node.cells[row]?.[col] ?? 0;
      let nextValue = 0;

      if (currentValue === 0 || currentValue == null) {
        nextValue = cell.dataset.original ?? 1;
      }

      node.cells[row][col] = nextValue;
      updateCells(node.cells);
      renderCells();
      setLastAction(`Updated ${id} cells`);
    });

    renderCells();
    editor.append(title, controls, grid);
    container.append(editor);
  };

  const buildGridControl = (label, action) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'grid-control';
    button.dataset.gridAction = action;
    button.textContent = label;
    return button;
  };

  const handleInspectorChange = (
    id,
    node,
    path,
    rawValue,
    inputType,
    originalValue,
  ) => {
    const value = coerceValue(rawValue, inputType, originalValue);
    if (value === null) return;

    const draft = JSON.parse(JSON.stringify(node));
    setNodeValue(draft, path, value);
    const validation = validateNode(draft, node.type);
    if (!validation.success) {
      setEditorError(validation.message);
      renderInspector(id);
      return;
    }

    setNodeValue(node, path, value);
    patchmap.update({
      path: `$..[?(@.id=="${id}")]`,
      changes: buildChangesFromPath(path, value),
    });

    setEditorValue(currentData);
    clearEditorError();
    setLastAction(`Updated ${id}`);
  };

  const coerceValue = (rawValue, inputType, originalValue) => {
    if (inputType === 'number') {
      if (rawValue === '') return null;
      const numberValue = Number(rawValue);
      return Number.isNaN(numberValue) ? null : numberValue;
    }
    if (inputType === 'boolean') {
      return Boolean(rawValue);
    }
    if (typeof originalValue === 'number') {
      const numberValue = Number(rawValue);
      if (!Number.isNaN(numberValue)) {
        return numberValue;
      }
    }
    return rawValue;
  };

  const setNodeValue = (node, path, value) => {
    const keys = path.split('.');
    let current = node;
    keys.forEach((key, index) => {
      if (index === keys.length - 1) {
        current[key] = value;
        return;
      }
      if (typeof current[key] !== 'object' || current[key] === null) {
        current[key] = {};
      }
      current = current[key];
    });
  };

  const buildChangesFromPath = (path, value) => {
    const keys = path.split('.');
    const changes = {};
    let current = changes;
    keys.forEach((key, index) => {
      if (index === keys.length - 1) {
        current[key] = value;
        return;
      }
      current[key] = {};
      current = current[key];
    });
    return changes;
  };

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
      selectedNodeId,
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

  const resolveAddParentSelection = (previous, selectedId, options) => {
    const values = new Set(options.map((option) => option.value));
    if (previous && values.has(previous)) return previous;
    if (selectedId && values.has(selectedId)) return selectedId;
    return '__root__';
  };

  const buildAddParentOptions = () => {
    const options = [{ value: '__root__', label: 'Root' }];
    nodeIndex.forEach((entry, id) => {
      const type = entry.node?.type;
      if (type === 'group' || type === 'item' || type === 'grid') {
        options.push({ value: id, label: `${type}:${id}` });
      }
    });
    return options;
  };

  const updateAddTypeOptions = () => {
    if (!elements.dataAddType || !elements.dataAddParent) return;
    const previous = elements.dataAddType.value;
    const parentEntry = nodeIndex.get(elements.dataAddParent.value);
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

    if (nodeIndex.has(id)) {
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
      currentData.push(node);
    } else {
      const parentEntry = nodeIndex.get(parentId);
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

    patchmap.draw(currentData);
    patchmap.fit();
    setCurrentData(currentData);
    selectNodeById(id);
    setLastAction(`Added ${id}`);
    closeAddPopover();
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

  const generateId = (type) => {
    const base = type.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    let candidate = `${base}-${Math.random().toString(36).slice(2, 6)}`;
    while (nodeIndex.has(candidate)) {
      candidate = `${base}-${Math.random().toString(36).slice(2, 6)}`;
    }
    return candidate;
  };

  const deleteNodeById = (nodeId) => {
    if (!nodeId) return;
    const entry = nodeIndex.get(nodeId);
    if (!entry) return;

    const { parentId } = entry;
    let removed = false;
    if (!parentId) {
      const index = currentData.findIndex((node) => node.id === nodeId);
      if (index >= 0) {
        currentData.splice(index, 1);
        removed = true;
      }
    } else {
      const parentEntry = nodeIndex.get(parentId);
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

    patchmap.draw(currentData);
    patchmap.fit();
    setCurrentData(currentData);
    updateSelection(null);
    setLastAction(`Deleted ${nodeId}`);
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

  const formatError = (error) => {
    if (error?.message) return error.message;
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  };

  const setEditorValue = (data) => {
    elements.editor.value = JSON.stringify(data, null, 2);
  };

  const parseEditorValue = () => {
    try {
      return JSON.parse(elements.editor.value);
    } catch (error) {
      setEditorError(`JSON parse error: ${error.message}`);
      return null;
    }
  };

  const setEditorError = (message) => {
    elements.editorError.textContent = message;
  };

  const clearEditorError = () => {
    elements.editorError.textContent = '';
  };

  const resolveNodeSchema = (node) => {
    if (!node?.type) {
      return { parsed: node, schema: null, kind: 'unknown', error: null };
    }

    const schema = componentTypes.has(node.type)
      ? componentSchema
      : elementTypes;
    const result = schema.safeParse(node);
    if (!result.success) {
      return {
        parsed: node,
        schema,
        kind: componentTypes.has(node.type) ? 'component' : 'element',
        error: result.error,
      };
    }

    return {
      parsed: result.data,
      schema,
      kind: componentTypes.has(node.type) ? 'component' : 'element',
      error: null,
    };
  };

  const validateNode = (node, type) => {
    const schema = componentTypes.has(type) ? componentSchema : elementTypes;
    const result = schema.safeParse(node);
    if (result.success) {
      return { success: true, message: '' };
    }
    return {
      success: false,
      message: result.error.issues?.[0]?.message ?? 'Invalid data',
    };
  };

  const formatPxPercent = (value) => {
    if (value == null) return null;
    if (typeof value === 'string' || typeof value === 'number') return value;
    if (typeof value === 'object' && 'value' in value && 'unit' in value) {
      return `${value.value}${value.unit}`;
    }
    return null;
  };

  return {
    setDataMode,
    setCurrentData,
    updateSelection,
    getSelectedNodeId,
    applyEditorData,
    prettifyEditor,
    selectNodeById,
    openAddPopover,
    closeAddPopover,
    updateAddTypeOptions,
    handleAddElement,
    deleteNodeById,
    clearEditorError,
  };
};
