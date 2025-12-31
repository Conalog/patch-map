import { Patchmap, Transformer } from '@patchmap';
import { createDataEditor } from './data-editor.js';
import { createScenarioController } from './scenario-controller.js';
import { scenarios } from './scenarios.js';
import { createSelectionController } from './selection-controller.js';
import { createViewControls } from './view-controls.js';

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

const setLastAction = (text) => {
  elements.lastAction.textContent = text;
};

const dataEditor = createDataEditor({ patchmap, elements, setLastAction });
const viewControls = createViewControls({ patchmap, elements, setLastAction });
const scenarioController = createScenarioController({
  patchmap,
  dataEditor,
  elements,
  scenarios,
  setLastAction,
  syncRotationUI: viewControls.syncRotationUI,
  syncFlipUI: viewControls.syncFlipUI,
});
const selectionController = createSelectionController({
  patchmap,
  dataEditor,
  elements,
});

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

  selectionController.bindSelectionState();

  scenarioController.setupScenarioOptions();
  bindControls();
  scenarioController.applyScenario(scenarioController.getCurrentScenario(), {
    shouldFit: true,
  });
  dataEditor.setDataMode('json');
  viewControls.syncRotationUI();
  viewControls.syncFlipUI();

  window.patchmap = patchmap;
  window.patchmapScenarios = scenarios;
};

const bindControls = () => {
  elements.scenario.addEventListener('change', (event) => {
    scenarioController.setScenarioById(event.target.value, {
      shouldFit: true,
    });
  });

  elements.draw.addEventListener('click', () => {
    scenarioController.applyScenario(scenarioController.getCurrentScenario(), {
      shouldFit: true,
    });
  });

  elements.applyData.addEventListener('click', () => {
    dataEditor.applyEditorData();
  });

  elements.prettifyData.addEventListener('click', () => {
    dataEditor.prettifyEditor();
  });

  elements.resetData.addEventListener('click', () => {
    scenarioController.applyScenario(scenarioController.getCurrentScenario(), {
      shouldFit: true,
    });
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
    scenarioController.randomizeMetrics();
  });

  elements.shuffle.addEventListener('click', () => {
    scenarioController.shuffleLinks();
  });

  elements.focus.addEventListener('click', () => {
    const currentScenario = scenarioController.getCurrentScenario();
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

  viewControls.bindViewControls();
  selectionController.bindSelectionShortcuts();
};

init();
