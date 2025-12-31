import { createAddPopover } from './data-editor/add-popover.js';
import {
  colorPresets,
  colorPresetValues,
  componentTypes,
} from './data-editor/constants.js';
import { createInspector } from './data-editor/inspector.js';
import { createTree } from './data-editor/tree.js';
import {
  buildChangesFromPath,
  coerceValue,
  formatError,
  formatPxPercent,
  resolveNodeSchema,
  setNodeValue,
  validateNode,
} from './data-editor/utils.js';

export const createDataEditor = ({ patchmap, elements, setLastAction }) => {
  const state = {
    currentData: [],
    nodeIndex: new Map(),
    treeItemById: new Map(),
    selectedNodeId: null,
  };

  let tree;
  let inspector;
  let addPopover;

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

  const setDataMode = (mode) => {
    const isJson = mode === 'json';
    elements.dataJsonView.hidden = !isJson;
    elements.dataFormView.hidden = isJson;
    elements.dataModeJson.classList.toggle('is-active', isJson);
    elements.dataModeForm.classList.toggle('is-active', !isJson);
    elements.dataModeJson.setAttribute('aria-selected', String(isJson));
    elements.dataModeForm.setAttribute('aria-selected', String(!isJson));
    if (isJson) {
      addPopover.closeAddPopover();
    }
    if (!isJson) {
      tree.renderTree();
      inspector.renderInspector(state.selectedNodeId);
    }
  };

  const setCurrentData = (data, { updateEditor = true } = {}) => {
    state.currentData = data;
    if (updateEditor) {
      setEditorValue(data);
    }
    tree.renderTree();
    inspector.renderInspector(state.selectedNodeId);
  };

  const updateSelection = (target, fallbackId = null) => {
    const id = target?.id ?? fallbackId ?? null;
    state.selectedNodeId = id;
    elements.selectedId.textContent = id ?? 'None';
    if (patchmap.transformer) {
      patchmap.transformer.elements = target ? [target] : [];
    }
    tree.highlightTree(id);
    inspector.renderInspector(id);
    addPopover.updateAddParentOptions();
  };

  const getSelectedNodeId = () => state.selectedNodeId;

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

  tree = createTree({
    elements,
    state,
    updateAddParentOptions: () => addPopover?.updateAddParentOptions?.(),
  });

  inspector = createInspector({
    patchmap,
    elements,
    state,
    componentTypes,
    colorPresets,
    colorPresetValues,
    resolveNodeSchema,
    validateNode,
    formatPxPercent,
    coerceValue,
    setNodeValue,
    buildChangesFromPath,
    setEditorValue,
    setEditorError,
    clearEditorError,
    setLastAction,
  });

  addPopover = createAddPopover({
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
  });

  return {
    setDataMode,
    setCurrentData,
    updateSelection,
    getSelectedNodeId,
    applyEditorData,
    prettifyEditor,
    selectNodeById,
    openAddPopover: (...args) => addPopover.openAddPopover(...args),
    closeAddPopover: () => addPopover.closeAddPopover(),
    updateAddTypeOptions: () => addPopover.updateAddTypeOptions(),
    handleAddElement: () => addPopover.handleAddElement(),
    deleteNodeById: (...args) => addPopover.deleteNodeById(...args),
    clearEditorError,
  };
};
