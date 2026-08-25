import {
  CONTROL_CASES,
  PERFORMANCE_CASE_TIMEOUT_MS,
  PERFORMANCE_TRANCHE_CASES,
} from './catalog.mjs';

export const BRIDGE_NAME = '__PATCH_MAP_CONTRACT_LAB__';
export const GPU_PROBE_NAME = '__PATCH_MAP_WEBGL_PROBE__';

export function executeBrowserUiRun(page, caseId, operation, buttonTestId) {
  return executeBrowserRun(
    page,
    operation,
    buttonTestId,
    caseId,
    CONTROL_CASES.has(caseId),
  );
}

export async function executeBrowserRun(
  page,
  operation,
  buttonTestId = null,
  focusedCaseId = null,
  genericControlCase = false,
) {
  const completionTimeoutMs = focusedCaseId !== null
    && PERFORMANCE_TRANCHE_CASES.has(focusedCaseId)
    ? PERFORMANCE_CASE_TIMEOUT_MS
    : 30_000;
  return page.evaluate(async ({
    bridgeName,
    gpuProbeName,
    operationName,
    triggerTestId,
    uiCaseId,
    collectGenericControlUi,
    completionTimeout,
  }) => {
    const bridge = window[bridgeName];
    if (!bridge) throw new Error(`Missing public Lab bridge ${bridgeName}`);
    const surface = document.querySelector('[data-contract-surface]');
    if (!surface) throw new Error('Missing focused contract surface');
    const gpuProbe = window[gpuProbeName];
    if (gpuProbe && typeof gpuProbe.begin === 'function') {
      gpuProbe.begin({ caseId: bridge.state().caseId, operation: operationName });
    }
    const canvasCount = () => surface.querySelectorAll('canvas').length;
    const initialCanvasCount = canvasCount();
    let maximumCanvasCount = initialCanvasCount;
    let observedCanvasCount = initialCanvasCount;
    const sample = () => {
      maximumCanvasCount = Math.max(maximumCanvasCount, canvasCount());
    };
    const countMutationCanvases = (nodes) => [...nodes].reduce((total, node) => {
      const ownCanvas = node.nodeName === 'CANVAS' ? 1 : 0;
      const nestedCanvases = typeof node.querySelectorAll === 'function'
        ? node.querySelectorAll('canvas').length
        : 0;
      return total + ownCanvas + nestedCanvases;
    }, 0);
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        observedCanvasCount -= countMutationCanvases(record.removedNodes);
        observedCanvasCount += countMutationCanvases(record.addedNodes);
        maximumCanvasCount = Math.max(maximumCanvasCount, observedCanvasCount);
      }
      sample();
    });
    observer.observe(surface, { childList: true, subtree: true });
    const interval = window.setInterval(sample, 0);

    try {
      let pending;
      let runningStatus;
      let run;
      let ui = null;
      if (triggerTestId !== null) {
        const button = document.querySelector(`[data-testid="${triggerTestId}"]`);
        if (!(button instanceof HTMLButtonElement)) {
          throw new Error(`Missing focused Lab control ${triggerTestId}`);
        }
        if (button.disabled) throw new Error(`Focused Lab control ${triggerTestId} is disabled`);
        const completion = waitForUiRunCompletion(bridge.state().rootTestId, operationName);
        button.click();
        await Promise.resolve();
        runningStatus = bridge.state().status;
        sample();
        run = await completion;
        ui = await collectFocusedUi({
          bridge,
          caseId: uiCaseId,
          triggerTestId,
          operationName,
          generic: collectGenericControlUi,
        });
      } else {
        const invoke = bridge[operationName];
        if (typeof invoke !== 'function') throw new Error(`Missing bridge operation ${operationName}`);
        pending = invoke.call(bridge);
        await Promise.resolve();
        runningStatus = bridge.state().status;
        sample();
        run = await pending;
      }
      sample();
      await Promise.resolve();
      sample();
      const actualObservation = await bridge.actualObservation();
      const execution = bridge.execution();
      const terminalAction = Array.isArray(execution?.actionResults)
        ? execution.actionResults.at(-1)
        : null;
      return {
        operation: operationName,
        runningStatus,
        terminalStatus: bridge.state().status,
        runStatus: run.status,
        executionStatus: execution?.status ?? null,
        actionStatuses: Array.isArray(execution?.actionResults)
          ? execution.actionResults.map((result) => result?.status ?? null)
          : [],
        actualObservation,
        fixtures: run.fixtures,
        captures: run.captures,
        actualMatchesRun: JSON.stringify(actualObservation) === JSON.stringify(run.actualObservation),
        cleanupStatus: run.cleanup?.status ?? null,
        diagnostics: {
          longTaskMeasurements:
            terminalAction?.delta?.actual?.longTasks?.measurements ?? null,
        },
        ui,
        gpu: gpuProbe && typeof gpuProbe.snapshot === 'function'
          ? gpuProbe.snapshot()
          : null,
        canvas: {
          initial: initialCanvasCount,
          maximumDuringRun: maximumCanvasCount,
          afterCleanup: canvasCount(),
        },
      };
    } finally {
      window.clearInterval(interval);
      observer.disconnect();
    }
    function waitForUiRunCompletion(rootTestId, expectedOperation) {
      const root = document.querySelector(`[data-testid="${rootTestId}"]`);
      if (!(root instanceof HTMLElement)) throw new Error(`Missing focused root ${rootTestId}`);
      return new Promise((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          root.removeEventListener('patch-map-contract-run-complete', onComplete);
          reject(new Error(`Focused ${rootTestId} run completion event timed out`));
        }, completionTimeout);
        const onComplete = (event) => {
          if (!(event instanceof CustomEvent) || event.detail?.operation !== expectedOperation) return;
          window.clearTimeout(timeout);
          root.removeEventListener('patch-map-contract-run-complete', onComplete);
          if (!event.detail.run || typeof event.detail.run !== 'object') {
            const execution = bridge.execution();
            const failureMessage = typeof execution?.error?.message === 'string'
              ? `: ${execution.error.message}`
              : '';
            reject(new Error(
              `Focused ${rootTestId} completion did not include a run result${failureMessage}`,
            ));
            return;
          }
          resolve(event.detail.run);
        };
        root.addEventListener('patch-map-contract-run-complete', onComplete);
      });
    }

    function collectFocusedUi(options) {
      if (options.generic) return collectGenericFocusedUi(options);
      if (options.caseId === 'REN-005') return collectRen005FocusedUi(options);
      if (options.caseId === 'REN-006' || options.caseId === 'REN-011') {
        return collectTextFocusedUi(options);
      }
      return collectComponentAssetFocusedUi(options);
    }

    async function collectGenericFocusedUi({
      bridge: activeBridge,
      caseId,
      triggerTestId,
    }) {
      const timeoutAt = performance.now() + 30_000;
      let lastState = null;
      for (;;) {
        const root = document.querySelector(`[data-testid="${activeBridge.state().rootTestId}"]`);
        const execution = activeBridge.execution();
        const expectedActionCount = Array.isArray(execution?.actionResults)
          ? execution.actionResults.length
          : 0;
        const statuses = root
          ? [...root.querySelectorAll('.contract-case-action[data-action-status]')]
            .map((row) => row.dataset.actionStatus)
          : [];
        const run = root?.querySelector('[data-testid="load-dataset"]');
        const repeat = root?.querySelector('[data-testid="repeat-action"]');
        const destroy = root?.querySelector('[data-testid="destroy-case"]');
        lastState = {
          contractStatus: root?.dataset.contractStatus ?? null,
          expectedActionCount,
          statuses,
          runDisabled: run instanceof HTMLButtonElement ? run.disabled : null,
          repeatDisabled: repeat instanceof HTMLButtonElement ? repeat.disabled : null,
          destroyDisabled: destroy instanceof HTMLButtonElement ? destroy.disabled : null,
        };
        if (
          root?.dataset.contractStatus === 'observed'
          && expectedActionCount > 0
          && statuses.length === expectedActionCount
          && statuses.every((status) => status === 'completed')
          && run instanceof HTMLButtonElement
          && repeat instanceof HTMLButtonElement
          && destroy instanceof HTMLButtonElement
          && run.disabled
          && !repeat.disabled
          && !destroy.disabled
        ) {
          return {
            trigger: `click:${triggerTestId}`,
            caseId,
            contractStatus: root.dataset.contractStatus,
            actionStatuses: statuses,
            controls: {
              runDisabled: run.disabled,
              repeatDisabled: repeat.disabled,
              destroyDisabled: destroy.disabled,
            },
          };
        }
        if (performance.now() >= timeoutAt) {
          throw new Error(
            `Focused ${caseId} generic DOM did not settle after ${triggerTestId}: `
              + JSON.stringify(lastState),
          );
        }
        await new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
      }
    }

    async function collectRen005FocusedUi({ bridge: activeBridge, triggerTestId, operationName }) {
      const expectedPerformanceRows = operationName === 'repeatCase' ? 2 : 1;
      const timeoutAt = performance.now() + 30_000;
      for (;;) {
        const root = document.querySelector(`[data-testid="${activeBridge.state().rootTestId}"]`);
        const statuses = root
          ? [...root.querySelectorAll('.contract-case-action[data-action-status]')]
            .map((row) => row.dataset.actionStatus)
          : [];
        const inspector = root?.querySelector('[data-testid="ren-005-image-inspector"]');
        const performanceRows = root?.querySelectorAll(
          '[data-testid="ren-005-performance-journal-row"]',
        ).length ?? 0;
        if (
          root?.dataset.contractStatus === 'observed'
          && statuses.length === 4
          && statuses.every((status) => status === 'completed')
          && inspector?.dataset.observationStatus === 'observed'
          && performanceRows === expectedPerformanceRows
        ) {
          return readFocusedUi(root, triggerTestId);
        }
        if (performance.now() >= timeoutAt) {
          throw new Error(`Focused REN-005 DOM did not settle after ${triggerTestId}`);
        }
        await new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
      }
    }

    async function collectTextFocusedUi({
      bridge: activeBridge,
      caseId,
      triggerTestId,
      operationName,
    }) {
      const config = caseId === 'REN-006'
        ? {
            prefix: 'ren-006',
            inspectorTestId: 'ren-006-text-inspector',
            actionCount: 6,
            choices: ['initial', 'empty', 'long', 'missing-font', 'rapid', 'terminal'],
            fieldNames: [
              'phase',
              'source',
              'visible-text',
              'lines',
              'font-runs',
              'layout-bounds',
              'world-bounds',
              'hit-bounds',
              'publication',
              'intermediate-publication-count',
              'stale-glyph-count',
              'renderer-route',
              'style',
              'geometry',
            ],
          }
        : caseId === 'REN-011'
          ? {
              prefix: 'ren-011',
              inspectorTestId: 'ren-011-text-inspector',
              actionCount: 4,
              choices: [
                'placed',
                'auto',
                'wrap',
                'overflow-visible',
                'overflow-hidden',
                'overflow-ellipsis',
                'upright',
              ],
              fieldNames: [
                'specimen',
                'source',
                'placement',
                'margin',
                'tint',
                'rgba',
                'frame',
                'auto-font',
                'wrap-width',
                'overflow',
                'visible-text',
                'lines',
                'layout-bounds',
                'item-angle',
                'orientation',
                'screen-angle',
                'local-bounds',
                'paint-tint',
                'publication',
                'all-rows-exact',
              ],
            }
          : null;
      if (!config) throw new Error(`Unsupported focused text UI case ${String(caseId)}`);
      const expectedPerformanceRows = operationName === 'repeatCase' ? 2 : 1;
      const timeoutAt = performance.now() + 30_000;
      let lastState = null;
      for (;;) {
        const root = document.querySelector(`[data-testid="${activeBridge.state().rootTestId}"]`);
        const statuses = root
          ? [...root.querySelectorAll('.contract-case-action[data-action-status]')]
            .map((row) => row.dataset.actionStatus)
          : [];
        const inspector = root?.querySelector(`[data-testid="${config.inspectorTestId}"]`);
        const performanceRows = root?.querySelectorAll(
          `[data-testid="${config.prefix}-performance-journal-row"]`,
        ).length ?? 0;
        lastState = {
          contractStatus: root?.dataset.contractStatus ?? null,
          statuses,
          inspectorStatus: inspector?.dataset.observationStatus ?? null,
          observedChoiceCount: inspector?.dataset.observedChoiceCount ?? null,
          selectedChoice: inspector?.dataset.selectedChoice ?? null,
          performanceRows,
        };
        if (
          root?.dataset.contractStatus === 'observed'
          && statuses.length === config.actionCount
          && statuses.every((status) => status === 'completed')
          && inspector?.dataset.observationStatus === 'observed'
          && Number(inspector.dataset.observedChoiceCount) === config.choices.length
          && typeof inspector.dataset.selectedChoice === 'string'
          && performanceRows === expectedPerformanceRows
        ) {
          return readTextFocusedUi(root, inspector, config, triggerTestId);
        }
        if (performance.now() >= timeoutAt) {
          throw new Error(
            `Focused ${caseId} text DOM did not settle after ${triggerTestId}: ${JSON.stringify(lastState)}`,
          );
        }
        await new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
      }
    }

    async function readTextFocusedUi(root, inspector, config, triggerTestId) {
      const chooser = root.querySelector(`[data-testid="${config.prefix}-text-choice-select"]`);
      if (!(chooser instanceof HTMLSelectElement)) {
        throw new Error(`Missing ${config.prefix} text chooser`);
      }
      const initialChoice = chooser.value;
      const selectedFacts = async (choice) => {
        chooser.value = choice;
        chooser.dispatchEvent(new Event('change', { bubbles: true }));
        const timeoutAt = performance.now() + 5_000;
        while (inspector.dataset.selectedChoice !== choice) {
          if (performance.now() >= timeoutAt) {
            throw new Error(`Focused ${config.prefix} choice ${choice} did not settle`);
          }
          await new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
        }
        return Object.fromEntries(config.fieldNames.map((field) => [
          field,
          textAt(root, `${config.prefix}-${field}`),
        ]));
      };
      const choices = {};
      for (const choice of config.choices) choices[choice] = await selectedFacts(choice);
      if (chooser.value !== initialChoice) await selectedFacts(initialChoice);
      const performanceRows = [...root.querySelectorAll(
        `[data-testid="${config.prefix}-performance-journal-row"]`,
      )];
      const latestPerformance = performanceRows.at(-1)?.dataset ?? {};
      return {
        trigger: `click:${triggerTestId}`,
        actionStatuses: [...root.querySelectorAll('.contract-case-action[data-action-status]')]
          .map((row) => row.dataset.actionStatus ?? null),
        chooser: {
          disabled: chooser.disabled,
          initialChoice,
          seededChoice: inspector.dataset.seededChoice ?? null,
          options: [...chooser.options].map((option) => ({
            value: option.value,
            disabled: option.disabled,
            observationStatus: option.dataset.observationStatus ?? null,
          })),
        },
        choices,
        observedChoiceCount: textAt(root, `${config.prefix}-observed-choice-count`),
        displayOnlyNote: textAt(root, `${config.prefix}-display-only-note`),
        performance: {
          count: performanceRows.length,
          latest: {
            runIndex: latestPerformance.runIndex ?? null,
            runKind: latestPerformance.runKind ?? null,
            framesPerSecond: latestPerformance.fps ?? null,
            frameCount: latestPerformance.frameCount ?? null,
            longTaskCount: latestPerformance.longTaskCount ?? null,
            longTaskTotalMs: latestPerformance.longTaskTotalMs ?? null,
            maxFrameGapMs: latestPerformance.maxFrameGapMs ?? null,
            durationMs: latestPerformance.durationMs ?? null,
          },
        },
      };
    }

    async function collectComponentAssetFocusedUi({
      bridge: activeBridge,
      caseId,
      triggerTestId,
      operationName,
    }) {
      const config = caseId === 'REN-008'
        ? {
            prefix: 'ren-008',
            inspectorTestId: 'ren-008-background-inspector',
            phases: ['initial', 'image', 'hidden', 'shown'],
            fieldNames: [
              'phase',
              'owner-id',
              'component-id',
              'entity-id',
              'logical-identity',
              'authored-size',
              'full-bounds',
              'visible-bounds',
              'source',
              'resource-state',
              'render-role',
              'binding-key',
              'generation',
              'render-object-count',
              'stale-count',
            ],
          }
        : caseId === 'REN-010'
          ? {
              prefix: 'ren-010',
              inspectorTestId: 'ren-010-icon-inspector',
              phases: ['initial', 'replacement', 'tint'],
              fieldNames: [
                'phase',
                'owner-id',
                'component-id',
                'entity-id',
                'logical-identity',
                'content-box',
                'icon-bounds',
                'authored-size',
                'placement',
                'margins',
                'source',
                'resource-state',
                'render-role',
                'binding-key',
                'generation',
                'semantic-tint',
                'renderer-tint',
                'render-object-count',
                'stale-count',
              ],
            }
          : null;
      if (!config) throw new Error(`Unsupported focused UI case ${String(caseId)}`);
      const expectedPerformanceRows = operationName === 'repeatCase' ? 2 : 1;
      const timeoutAt = performance.now() + 30_000;
      let lastState = null;
      for (;;) {
        const root = document.querySelector(`[data-testid="${activeBridge.state().rootTestId}"]`);
        const statuses = root
          ? [...root.querySelectorAll('.contract-case-action[data-action-status]')]
            .map((row) => row.dataset.actionStatus)
          : [];
        const inspector = root?.querySelector(`[data-testid="${config.inspectorTestId}"]`);
        const performanceRows = root?.querySelectorAll(
          `[data-testid="${config.prefix}-performance-journal-row"]`,
        ).length ?? 0;
        lastState = {
          contractStatus: root?.dataset.contractStatus ?? null,
          statuses,
          inspectorStatus: inspector?.dataset.observationStatus ?? null,
          observedPhaseCount: inspector?.dataset.observedPhaseCount ?? null,
          performanceRows,
        };
        if (
          root?.dataset.contractStatus === 'observed'
          && statuses.length === config.phases.length
          && statuses.every((status) => status === 'completed')
          && inspector?.dataset.observationStatus === 'observed'
          && Number(inspector.dataset.observedPhaseCount) === config.phases.length
          && performanceRows === expectedPerformanceRows
        ) {
          return readComponentAssetFocusedUi(root, config, triggerTestId);
        }
        if (performance.now() >= timeoutAt) {
          throw new Error(
            `Focused ${caseId} DOM did not settle after ${triggerTestId}: ${JSON.stringify(lastState)}`,
          );
        }
        await new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
      }
    }

    function readComponentAssetFocusedUi(root, config, triggerTestId) {
      const chooser = root.querySelector(`[data-testid="${config.prefix}-phase-select"]`);
      if (!(chooser instanceof HTMLSelectElement)) {
        throw new Error(`Missing ${config.prefix} phase chooser`);
      }
      const selectedFacts = (phase) => {
        chooser.value = phase;
        chooser.dispatchEvent(new Event('change', { bubbles: true }));
        return Object.fromEntries(config.fieldNames.map((field) => [
          field,
          textAt(root, `${config.prefix}-${field}`),
        ]));
      };
      const phases = Object.fromEntries(config.phases.map((phase) => [phase, selectedFacts(phase)]));
      const performanceRows = [...root.querySelectorAll(
        `[data-testid="${config.prefix}-performance-journal-row"]`,
      )];
      const latestPerformance = performanceRows.at(-1)?.dataset ?? {};
      const resourceRows = [...root.querySelectorAll(
        `[data-testid="${config.prefix}-resource-journal-row"]`,
      )];
      return {
        trigger: `click:${triggerTestId}`,
        actionStatuses: [...root.querySelectorAll('.contract-case-action[data-action-status]')]
          .map((row) => row.dataset.actionStatus ?? null),
        chooser: {
          disabled: chooser.disabled,
          options: [...chooser.options].map((option) => ({
            value: option.value,
            disabled: option.disabled,
            observationStatus: option.dataset.observationStatus ?? null,
          })),
        },
        phases,
        observedPhaseCount: textAt(root, `${config.prefix}-observed-phase-count`),
        captureId: config.prefix === 'ren-008'
          ? textAt(root, 'ren-008-capture-id')
          : null,
        resources: Object.fromEntries([
          'canvas-count',
          'subscription-count',
          'pending-work-count',
          'binding-count',
          'resource-count',
          'lease-count',
          'pending-settlement-count',
          'pending-release-count',
          'stale-attachment-resource-count',
          'renderer-object-resource-count',
          'cleanup-failure-count',
        ].map((field) => [field, textAt(root, `${config.prefix}-${field}`)])),
        resourceJournal: {
          count: resourceRows.length,
          events: resourceRows.map((row) => row.dataset.resourceEvent ?? null),
          phases: resourceRows.map((row) => row.dataset.resourcePhase ?? null),
        },
        performance: {
          count: performanceRows.length,
          latest: {
            runIndex: latestPerformance.runIndex ?? null,
            runKind: latestPerformance.runKind ?? null,
            framesPerSecond: latestPerformance.fps ?? null,
            frameCount: latestPerformance.frameCount ?? null,
            longTaskCount: latestPerformance.longTaskCount ?? null,
            longTaskTotalMs: latestPerformance.longTaskTotalMs ?? null,
            maxFrameGapMs: latestPerformance.maxFrameGapMs ?? null,
            durationMs: latestPerformance.durationMs ?? null,
          },
        },
      };
    }

    function readFocusedUi(root, triggerTestId) {
      const chooser = root.querySelector('[data-testid="ren-005-specimen-select"]');
      if (!(chooser instanceof HTMLSelectElement)) throw new Error('Missing REN-005 specimen chooser');
      const selectedFacts = (value) => {
        chooser.value = value;
        chooser.dispatchEvent(new Event('change', { bubbles: true }));
        return {
          source: textAt(root, 'ren-005-selected-source'),
          sourceKind: textAt(root, 'ren-005-selected-source-kind'),
          state: textAt(root, 'ren-005-selected-state'),
          role: textAt(root, 'ren-005-selected-role'),
          bounds: textAt(root, 'ren-005-selected-bounds'),
          initialSource: textAt(root, 'ren-005-selected-initial-source'),
          initialState: textAt(root, 'ren-005-selected-initial-state'),
          staleAttachCount: textAt(root, 'ren-005-selected-stale-attach'),
          staleCompletionCount: textAt(root, 'ren-005-selected-stale-completion'),
          diagnosticCount: textAt(root, 'ren-005-selected-diagnostics'),
        };
      };
      const descriptor = selectedFacts('descriptor');
      const failed = selectedFacts('failed-image');
      const journalRows = [...root.querySelectorAll('[data-testid="ren-005-request-journal-row"]')];
      const performanceRows = [...root.querySelectorAll(
        '[data-testid="ren-005-performance-journal-row"]',
      )];
      const latestPerformance = performanceRows.at(-1)?.dataset ?? {};
      return {
        trigger: `click:${triggerTestId}`,
        actionStatuses: [...root.querySelectorAll('.contract-case-action[data-action-status]')]
          .map((row) => row.dataset.actionStatus ?? null),
        chooserOptions: [...chooser.options].map(({ value }) => value),
        descriptor,
        failed,
        counters: {
          requests: textAt(root, 'ren-005-request-count'),
          backend: textAt(root, 'ren-005-backend-counts'),
          resources: textAt(root, 'ren-005-resource-count'),
          leases: textAt(root, 'ren-005-lease-count'),
          stale: textAt(root, 'ren-005-stale-count'),
          pendingRelease: textAt(root, 'ren-005-pending-release-count'),
        },
        requestJournal: {
          count: journalRows.length,
          events: journalRows.map((row) => row.dataset.requestEvent ?? null),
          kinds: journalRows.map((row) => row.dataset.requestKind ?? null),
        },
        performance: {
          count: performanceRows.length,
          latest: {
            runIndex: latestPerformance.runIndex ?? null,
            runKind: latestPerformance.runKind ?? null,
            framesPerSecond: latestPerformance.fps ?? null,
            frameCount: latestPerformance.frameCount ?? null,
            longTaskCount: latestPerformance.longTaskCount ?? null,
            longTaskTotalMs: latestPerformance.longTaskTotalMs ?? null,
            maxFrameGapMs: latestPerformance.maxFrameGapMs ?? null,
            durationMs: latestPerformance.durationMs ?? null,
          },
        },
      };
    }

    function textAt(root, testId) {
      const element = root.querySelector(`[data-testid="${testId}"]`);
      const value = element?.textContent?.trim();
      if (typeof value !== 'string' || value.length === 0) {
        throw new Error(`Missing focused DOM fact ${testId}: ${element?.outerHTML ?? 'absent'}`);
      }
      return value;
    }
  }, {
    bridgeName: BRIDGE_NAME,
    gpuProbeName: GPU_PROBE_NAME,
    operationName: operation,
    triggerTestId: buttonTestId,
    uiCaseId: focusedCaseId,
    collectGenericControlUi: genericControlCase,
    completionTimeout: completionTimeoutMs,
  });
}
