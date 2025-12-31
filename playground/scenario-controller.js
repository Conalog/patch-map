export const createScenarioController = ({
  patchmap,
  dataEditor,
  elements,
  scenarios,
  setLastAction,
  syncRotationUI,
  syncFlipUI,
}) => {
  let currentScenario = scenarios[0];
  let linkSetIndex = 0;

  const setupScenarioOptions = () => {
    scenarios.forEach((scenario) => {
      const option = document.createElement('option');
      option.value = scenario.id;
      option.textContent = scenario.name;
      elements.scenario.append(option);
    });
    elements.scenario.value = currentScenario.id;
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

  const setScenarioById = (scenarioId, options) => {
    const scenario = scenarios.find((item) => item.id === scenarioId);
    if (scenario) {
      applyScenario(scenario, options);
    }
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

  const getCurrentScenario = () => currentScenario;

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

  return {
    setupScenarioOptions,
    applyScenario,
    setScenarioById,
    randomizeMetrics,
    shuffleLinks,
    getCurrentScenario,
  };
};
