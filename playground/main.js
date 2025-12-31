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
  sceneName: $('#scene-name'),
  sceneTitle: $('#scene-title'),
  sceneDescription: $('#scene-description'),
  selectedId: $('#selected-id'),
  lastAction: $('#last-action'),
};

const patchmap = new Patchmap();
let currentScenario = scenarios[0];
let linkSetIndex = 0;

const setLastAction = (text) => {
  elements.lastAction.textContent = text;
};

const dataEditor = createDataEditor({ patchmap, elements, setLastAction });

const init = async () => {
  await patchmap.init(elements.stage);
  patchmap.transformer = new Transformer();

  patchmap.stateManager.setState('selection', {
    onClick: (target) => dataEditor.updateSelection(target),
  });

  setupScenarioOptions();
  bindControls();
  applyScenario(currentScenario, { shouldFit: true });
  dataEditor.setDataMode('json');

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
    patchmap.viewport.setZoom(1, true);
    patchmap.viewport.moveCenter(0, 0);
    setLastAction('Reset zoom');
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

const randomInt = (min, max) => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

init();
