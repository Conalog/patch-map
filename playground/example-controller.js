export const createExampleController = ({
  patchmap,
  dataEditor,
  elements,
  examples,
  setLastAction,
  syncRotationUI,
  syncFlipUI,
}) => {
  let currentExample = examples[0];
  let linkSetIndex = 0;

  const setupExampleOptions = () => {
    examples.forEach((example) => {
      const option = document.createElement('option');
      option.value = example.id;
      option.textContent = example.name;
      elements.scenario.append(option);
    });
    elements.scenario.value = currentExample.id;
  };

  const applyExample = (example, { shouldFit = true } = {}) => {
    currentExample = example;
    linkSetIndex = 0;

    const data = currentExample.data();
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
    setLastAction(`Loaded ${currentExample.name}`);
  };

  const setExampleById = (exampleId, options) => {
    const example = examples.find((item) => item.id === exampleId);
    if (example) {
      applyExample(example, options);
    }
  };

  const updateSceneInfo = () => {
    if (elements.sceneName) {
      elements.sceneName.textContent = currentExample.name;
    }
    if (elements.sceneTitle) {
      elements.sceneTitle.textContent = currentExample.name;
    }
    if (elements.sceneDescription) {
      elements.sceneDescription.textContent = currentExample.description;
    }
  };

  const updateActionButtons = () => {
    const dynamic = currentExample.dynamic ?? {};
    elements.randomize.disabled = (dynamic.bars ?? []).length === 0;
    elements.shuffle.disabled =
      !dynamic.relationsId || (dynamic.linkSets ?? []).length < 2;
  };

  const randomizeMetrics = () => {
    const bars = currentExample.dynamic?.bars ?? [];
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
    const links = currentExample.dynamic?.linkSets ?? [];
    if (!currentExample.dynamic?.relationsId || links.length === 0) {
      return;
    }

    linkSetIndex = (linkSetIndex + 1) % links.length;

    patchmap.update({
      path: `$..[?(@.id=="${currentExample.dynamic.relationsId}")]`,
      changes: { links: links[linkSetIndex] },
      mergeStrategy: 'replace',
    });

    setLastAction('Rerouted links');
  };

  const getCurrentExample = () => currentExample;

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
    setupExampleOptions,
    applyExample,
    setExampleById,
    randomizeMetrics,
    shuffleLinks,
    getCurrentExample,
  };
};
