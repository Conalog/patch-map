import { Patchmap, Transformer } from '@patchmap';
import { createDataEditor } from './data-editor.js';
import { scenarios } from './scenarios.js';

const $ = (selector) => document.querySelector(selector);

const elements = {
  stage: $('#patchmap-root'),
  scenario: $('#scenario'),
  draw: $('#draw'),
  editor: $('#data-editor'),
  applyData: $('#apply-data'),
  prettifyData: $('#prettify-data'),
  resetData: $('#reset-data'),
  editorError: $('#editor-error'),
  dataModeJson: $('#data-mode-json'),
  dataModeForm: $('#data-mode-form'),
  dataJsonView: $('#data-json'),
  dataFormView: $('#data-form'),
  dataTree: $('#data-tree'),
  dataInspector: $('#data-inspector'),
  inspectorContent: $('#inspector-content'),
  dataPopover: $('#data-popover'),
  addCancel: $('#add-cancel'),
  dataAddParent: $('#add-parent'),
  dataAddType: $('#add-type'),
  dataAddId: $('#add-id'),
  dataAddLabel: $('#add-label'),
  dataAddButton: $('#add-element'),
  randomize: $('#randomize'),
  shuffle: $('#shuffle-links'),
  focus: $('#focus-target'),
  fit: $('#fit-view'),
  reset: $('#reset-view'),
  rotateRange: $('#rotate-angle'),
  rotateInput: $('#rotate-input'),
  rotateLeft: $('#rotate-left'),
  rotateRight: $('#rotate-right'),
  rotateReset: $('#rotate-reset'),
  flipX: $('#flip-x'),
  flipY: $('#flip-y'),
  sceneName: $('#scene-name'),
  sceneTitle: $('#scene-title'),
  sceneDescription: $('#scene-description'),
  selectedId: $('#selected-id'),
  lastAction: $('#last-action'),
};

const patchmap = new Patchmap();
let currentScenario = scenarios[0];
let linkSetIndex = 0;
let isSpaceDown = false;
let ignoreClickAfterDrag = false;

const setLastAction = (text) => {
  elements.lastAction.textContent = text;
};

const dataEditor = createDataEditor({ patchmap, elements, setLastAction });

const getSelectionList = () => {
  if (!patchmap.transformer) return [];
  return Array.isArray(patchmap.transformer.elements)
    ? patchmap.transformer.elements
    : [patchmap.transformer.elements].filter(Boolean);
};

const setSelectionList = (list) => {
  if (!patchmap.transformer) return;
  patchmap.transformer.elements = list;
};

const clearSelection = () => {
  dataEditor.updateSelection(null);
  elements.selectedId.textContent = 'None';
};

const applySelection = (list) => {
  const next = list.filter(Boolean);
  if (next.length === 0) {
    clearSelection();
    return;
  }
  if (next.length === 1) {
    dataEditor.updateSelection(next[0]);
    return;
  }
  dataEditor.updateSelection(null);
  setSelectionList(next);
  elements.selectedId.textContent = `Multiple (${next.length})`;
};

const toggleSelection = (target) => {
  if (!target) return;
  const current = getSelectionList();
  const exists = current.some((item) => item.id === target.id);
  const next = exists
    ? current.filter((item) => item.id !== target.id)
    : [...current, target];
  applySelection(next);
};

const updateSelectionDraggable = (enabled) => {
  const state = patchmap.stateManager?.getCurrentState?.();
  if (state?.config) {
    state.config.draggable = enabled;
  }
};

const setDragButtons = (buttons) => {
  const dragPlugin = patchmap.viewport?.plugins?.get('drag');
  if (dragPlugin?.mouseButtons) {
    dragPlugin.mouseButtons(buttons);
  }
};

const init = async () => {
  await patchmap.init(elements.stage, {
    viewport: {
      disableOnContextMenu: true,
      plugins: {
        drag: { mouseButtons: 'middle' },
      },
    },
  });
  patchmap.transformer = new Transformer();

  patchmap.stateManager.setState('selection', {
    onDown: () => {
      if (ignoreClickAfterDrag) {
        ignoreClickAfterDrag = false;
      }
    },
    onDragStart: () => {
      ignoreClickAfterDrag = true;
    },
    onClick: (target, event) => {
      if (ignoreClickAfterDrag) {
        ignoreClickAfterDrag = false;
        return;
      }
      if (isSpaceDown) return;
      const mod = event?.metaKey || event?.ctrlKey;
      if (mod) {
        toggleSelection(target);
        return;
      }
      dataEditor.updateSelection(target);
    },
    draggable: true,
    onDragEnd: (selected, event) => {
      ignoreClickAfterDrag = true;
      if (!selected || selected.length === 0 || isSpaceDown) {
        return;
      }
      const mod = event?.metaKey || event?.ctrlKey;
      if (mod) {
        const current = getSelectionList();
        const ids = new Set(current.map((item) => item.id));
        const merged = [
          ...current,
          ...selected.filter((item) => !ids.has(item.id)),
        ];
        applySelection(merged);
        return;
      }
      applySelection(selected);
    },
  });

  setupScenarioOptions();
  bindControls();
  applyScenario(currentScenario, { shouldFit: true });
  dataEditor.setDataMode('json');
  syncRotationUI();
  syncFlipUI();

  window.patchmap = patchmap;
  window.patchmapScenarios = scenarios;
};

const setupScenarioOptions = () => {
  scenarios.forEach((scenario) => {
    const option = document.createElement('option');
    option.value = scenario.id;
    option.textContent = scenario.name;
    elements.scenario.append(option);
  });
  elements.scenario.value = currentScenario.id;
};

const bindControls = () => {
  elements.scenario.addEventListener('change', (event) => {
    const scenario = scenarios.find((item) => item.id === event.target.value);
    if (scenario) {
      applyScenario(scenario, { shouldFit: true });
    }
  });

  elements.draw.addEventListener('click', () => {
    applyScenario(currentScenario, { shouldFit: true });
  });

  elements.applyData.addEventListener('click', () => {
    dataEditor.applyEditorData();
  });

  elements.prettifyData.addEventListener('click', () => {
    dataEditor.prettifyEditor();
  });

  elements.resetData.addEventListener('click', () => {
    applyScenario(currentScenario, { shouldFit: true });
    setLastAction('Reset to scenario');
  });

  elements.dataModeJson.addEventListener('click', () => {
    dataEditor.setDataMode('json');
  });

  elements.dataModeForm.addEventListener('click', () => {
    dataEditor.setDataMode('form');
  });

  if (elements.dataTree) {
    elements.dataTree.addEventListener('click', (event) => {
      const actionButton = event.target.closest('[data-action]');
      if (actionButton) {
        const action = actionButton.dataset.action;
        if (action === 'add') {
          dataEditor.openAddPopover(
            actionButton.dataset.parentId ?? '__root__',
          );
        }
        if (action === 'delete') {
          dataEditor.deleteNodeById(actionButton.dataset.nodeId);
        }
        return;
      }

      const button = event.target.closest('[data-node-id]');
      if (!button) return;
      dataEditor.selectNodeById(button.dataset.nodeId);
    });
  }

  if (elements.dataAddParent) {
    elements.dataAddParent.addEventListener('change', () => {
      dataEditor.updateAddTypeOptions();
    });
  }

  if (elements.addCancel) {
    elements.addCancel.addEventListener('click', () => {
      dataEditor.closeAddPopover();
    });
  }

  if (elements.dataAddButton) {
    elements.dataAddButton.addEventListener('click', () => {
      dataEditor.handleAddElement();
    });
  }

  elements.randomize.addEventListener('click', () => {
    randomizeMetrics();
  });

  elements.shuffle.addEventListener('click', () => {
    shuffleLinks();
  });

  elements.focus.addEventListener('click', () => {
    const targetId = dataEditor.getSelectedNodeId() ?? currentScenario.focusId;
    if (targetId) {
      patchmap.focus(targetId);
      setLastAction(`Focus ${targetId}`);
    }
  });

  elements.fit.addEventListener('click', () => {
    patchmap.fit();
    setLastAction('Fit to content');
  });

  elements.reset.addEventListener('click', () => {
    patchmap.resetRotation();
    patchmap.resetFlip();
    patchmap.viewport.setZoom(1, true);
    patchmap.viewport.moveCenter(0, 0);
    syncRotationUI(0);
    syncFlipUI();
    setLastAction('Reset zoom');
  });

  if (elements.rotateRange) {
    elements.rotateRange.addEventListener('input', (event) => {
      applyRotation(event.target.value, { updateAction: false });
    });
    elements.rotateRange.addEventListener('change', (event) => {
      applyRotation(event.target.value);
    });
  }

  if (elements.rotateInput) {
    elements.rotateInput.addEventListener('change', (event) => {
      applyRotation(event.target.value);
    });
    elements.rotateInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        applyRotation(event.target.value);
      }
    });
  }

  if (elements.rotateLeft) {
    elements.rotateLeft.addEventListener('click', () => {
      patchmap.rotateBy(-15);
      syncRotationUI();
      setLastAction(`Rotate ${patchmap.getRotation()}°`);
    });
  }

  if (elements.rotateRight) {
    elements.rotateRight.addEventListener('click', () => {
      patchmap.rotateBy(15);
      syncRotationUI();
      setLastAction(`Rotate ${patchmap.getRotation()}°`);
    });
  }

  if (elements.rotateReset) {
    elements.rotateReset.addEventListener('click', () => {
      patchmap.resetRotation();
      syncRotationUI(0);
      setLastAction('Rotate 0°');
    });
  }

  if (elements.flipX) {
    elements.flipX.addEventListener('click', () => {
      patchmap.toggleFlipX();
      syncFlipUI();
      setLastAction(patchmap.getFlip().x ? 'Flip X on' : 'Flip X off');
    });
  }

  if (elements.flipY) {
    elements.flipY.addEventListener('click', () => {
      patchmap.toggleFlipY();
      syncFlipUI();
      setLastAction(patchmap.getFlip().y ? 'Flip Y on' : 'Flip Y off');
    });
  }

  if (elements.stage) {
    elements.stage.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      clearSelection();
    });
  }

  window.addEventListener('keydown', (event) => {
    if (event.code !== 'Space') return;
    const target = event.target;
    if (
      target?.tagName === 'INPUT' ||
      target?.tagName === 'TEXTAREA' ||
      target?.isContentEditable
    ) {
      return;
    }
    if (isSpaceDown) return;
    event.preventDefault();
    isSpaceDown = true;
    updateSelectionDraggable(false);
    setDragButtons('left middle');
  });

  window.addEventListener('keyup', (event) => {
    if (event.code !== 'Space') return;
    if (!isSpaceDown) return;
    isSpaceDown = false;
    updateSelectionDraggable(true);
    setDragButtons('middle');
  });
};

const applyScenario = (scenario, { shouldFit = true } = {}) => {
  currentScenario = scenario;
  linkSetIndex = 0;

  const data = currentScenario.data();
  patchmap.draw(data);
  if (shouldFit) {
    patchmap.fit();
  }
  updateSceneInfo();
  dataEditor.setCurrentData(data);
  dataEditor.updateSelection(null);
  dataEditor.clearEditorError();
  updateActionButtons();
  syncRotationUI();
  syncFlipUI();
  setLastAction(`Loaded ${currentScenario.name}`);
};

const updateSceneInfo = () => {
  if (elements.sceneName) {
    elements.sceneName.textContent = currentScenario.name;
  }
  if (elements.sceneTitle) {
    elements.sceneTitle.textContent = currentScenario.name;
  }
  if (elements.sceneDescription) {
    elements.sceneDescription.textContent = currentScenario.description;
  }
};

const updateActionButtons = () => {
  const dynamic = currentScenario.dynamic ?? {};
  elements.randomize.disabled = (dynamic.bars ?? []).length === 0;
  elements.shuffle.disabled =
    !dynamic.relationsId || (dynamic.linkSets ?? []).length < 2;
};

const randomizeMetrics = () => {
  const bars = currentScenario.dynamic?.bars ?? [];
  bars.forEach((bar) => {
    if (bar.path) {
      const targets = patchmap.selector(bar.path);
      targets.forEach((target) => {
        const value = randomInt(bar.min ?? 10, bar.max ?? 90);
        patchmap.update({
          elements: target,
          changes: { size: buildBarSize(bar, value) },
        });
      });
      return;
    }

    if (!bar.id) return;
    const value = randomInt(bar.min ?? 10, bar.max ?? 90);
    patchmap.update({
      path: `$..[?(@.id=="${bar.id}")]`,
      changes: { size: buildBarSize(bar, value) },
    });

    if (bar.textId) {
      const label = bar.label ?? 'Metric';
      const suffix = bar.unit ?? (label === 'Latency' ? 'ms' : '%');
      const text = `${label} ${value}${suffix}`;
      patchmap.update({
        path: `$..[?(@.id=="${bar.textId}")]`,
        changes: { text },
      });
    }
  });

  setLastAction('Randomized metrics');
};

const shuffleLinks = () => {
  const links = currentScenario.dynamic?.linkSets ?? [];
  if (!currentScenario.dynamic?.relationsId || links.length === 0) {
    return;
  }

  linkSetIndex = (linkSetIndex + 1) % links.length;

  patchmap.update({
    path: `$..[?(@.id=="${currentScenario.dynamic.relationsId}")]`,
    changes: { links: links[linkSetIndex] },
    mergeStrategy: 'replace',
  });

  setLastAction('Rerouted links');
};

const buildBarSize = (bar, value) => {
  const axis = bar.axis ?? 'width';
  if (axis === 'height') {
    return { width: bar.width ?? '100%', height: `${value}%` };
  }
  return { width: `${value}%`, height: bar.height ?? 10 };
};

const clampRotation = (value) => {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return 0;
  return Math.min(180, Math.max(-180, parsed));
};

const syncRotationUI = (angle = patchmap.getRotation()) => {
  const nextAngle = clampRotation(angle);
  if (elements.rotateRange) {
    elements.rotateRange.value = String(nextAngle);
  }
  if (elements.rotateInput) {
    elements.rotateInput.value = String(nextAngle);
  }
};

const applyRotation = (value, { updateAction = true } = {}) => {
  const nextAngle = clampRotation(value);
  patchmap.setRotation(nextAngle);
  syncRotationUI(nextAngle);
  if (updateAction) {
    setLastAction(`Rotate ${nextAngle}°`);
  }
};

const syncFlipUI = () => {
  const { x, y } = patchmap.getFlip();
  elements.flipX?.classList.toggle('is-active', x);
  elements.flipY?.classList.toggle('is-active', y);
};

const randomInt = (min, max) => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

init();
