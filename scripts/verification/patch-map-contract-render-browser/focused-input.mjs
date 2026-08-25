import { invariant, sameJson } from './assertions.mjs';

export async function verifyViewportRootInput(page, bridgeName) {
  const wheelProbeName = '__PATCH_MAP_NATIVE_WHEEL_PROBE__';
  let armed = false;
  let cleanup = null;
  try {
    const gesturePlan = await page.evaluate(async (bridgeName) => {
      const bridge = window[bridgeName];
      if (!bridge) throw new Error('VIE-001 focused Lab bridge is unavailable');
      return bridge.armGesture(0);
    }, bridgeName);
    armed = true;

    const canvas = page.locator(gesturePlan.ownerQualifiedTarget);
    await canvas.waitFor({ state: 'visible', timeout: 30_000 });
    await canvas.scrollIntoViewIfNeeded();
    await canvas.evaluate((element, name) => {
      const state = { count: 0, lastDeltaY: null };
      const listener = (event) => {
        state.count += 1;
        state.lastDeltaY = event.deltaY;
      };
      element.addEventListener('wheel', listener, { capture: true });
      window[name] = { element, listener, state };
    }, wheelProbeName);
    const bounds = await canvas.boundingBox();
    invariant(bounds !== null, 'VIE-001 trusted input canvas bounds');
    const center = {
      x: bounds.x + bounds.width / 2,
      y: bounds.y + bounds.height / 2,
    };

    await page.mouse.move(center.x, center.y);
    await page.mouse.down({ button: 'left' });
    await page.mouse.move(center.x + 40, center.y - 20, { steps: 1 });
    await page.mouse.up({ button: 'left' });
    await page.waitForFunction(
      async (bridgeName) => {
        const observation = await window[bridgeName]?.actualObservation();
        return Array.isArray(observation?.events) && observation.events.length >= 1;
      },
      bridgeName,
      { timeout: 10_000 },
    );

    const beforeWheel = await page.evaluate(async (bridgeName) => {
      const observation = await window[bridgeName].actualObservation();
      return observation.anchorWorld;
    }, bridgeName);
    await page.mouse.move(center.x, center.y);
    await page.mouse.wheel(0, -240);
    await page.waitForFunction(
      async (bridgeName) => {
        const observation = await window[bridgeName]?.actualObservation();
        return Array.isArray(observation?.events) && observation.events.length >= 2;
      },
      bridgeName,
      { timeout: 10_000 },
    );

    const observed = await page.evaluate(async (bridgeName) => {
      const bridge = window[bridgeName];
      await bridge.awaitMilestone(0, 'settled');
      const observation = await bridge.actualObservation();
      const nativeWheel = window.__PATCH_MAP_NATIVE_WHEEL_PROBE__?.state ?? null;
      return {
        events: observation.events,
        viewport: observation.viewport,
        revisions: observation.revisions,
        ownership: observation.ownership,
        anchorWorld: observation.anchorWorld,
        transformedHit: observation.transformedHit,
        resources: observation.resources,
        nativeWheel,
      };
    }, bridgeName);

    invariant(
      observed.events.length === 2 &&
        observed.events[0]?.source === 'pointer' &&
        observed.events[1]?.source === 'wheel',
      `VIE-001 trusted pointer and wheel publish exactly one view event each: ${
        JSON.stringify(observed.events)
      }`,
    );
    invariant(
      observed.viewport.scale > 1 && observed.viewport.scale <= 4,
      'VIE-001 trusted wheel respects configured scale limits',
    );
    const cursorScreenError = Math.hypot(
      beforeWheel.x - observed.anchorWorld.x,
      beforeWheel.y - observed.anchorWorld.y,
    ) * observed.viewport.scale;
    invariant(
      Number.isFinite(cursorScreenError) && cursorScreenError < 1,
      `VIE-001 trusted wheel preserves the cursor world point (${
        JSON.stringify({
          before: beforeWheel,
          after: observed.anchorWorld,
          viewport: observed.viewport,
          cursorScreenError,
        })
      })`,
    );
    invariant(
      observed.transformedHit.target === 'rect-b',
      'VIE-001 trusted transformed hit resolves the current target',
    );
    invariant(
      observed.ownership?.rootBindingCount === 6 &&
        observed.ownership?.entityCallbackCount === 0,
      'VIE-001 trusted input retains root-only interaction ownership',
    );
    invariant(
      observed.revisions.viewRevision >= 2,
      'VIE-001 trusted input advances the Engine view authority',
    );
    invariant(
      observed.resources?.canvasCount === 1 &&
        observed.resources?.pendingWork === 0,
      'VIE-001 trusted input keeps one settled live canvas',
    );
    invariant(
      observed.nativeWheel?.count === 1 && observed.nativeWheel?.lastDeltaY === -240,
      `VIE-001 trusted browser emitted one native wheel event: ${
        JSON.stringify(observed.nativeWheel)
      }`,
    );
    return {
      status: 'passed',
      driverId: gesturePlan.driverId,
      eventSources: observed.events.map(({ source }) => source),
      viewport: observed.viewport,
      revisions: observed.revisions,
      ownership: observed.ownership,
      wheelAnchor: {
        before: beforeWheel,
        after: observed.anchorWorld,
        screenError: cursorScreenError,
      },
      transformedHit: observed.transformedHit,
    };
  } finally {
    cleanup = await page.evaluate(async ({ bridgeName, shouldRelease }) => {
      const nativeWheelProbe = window.__PATCH_MAP_NATIVE_WHEEL_PROBE__;
      if (nativeWheelProbe) {
        nativeWheelProbe.element.removeEventListener('wheel', nativeWheelProbe.listener, {
          capture: true,
        });
        delete window.__PATCH_MAP_NATIVE_WHEEL_PROBE__;
      }
      const bridge = window[bridgeName];
      if (bridge && shouldRelease) await bridge.awaitMilestone(0, 'released');
      const host = document.querySelector('[data-contract-surface]');
      return {
        canvasCount:
          host?.querySelectorAll('canvas[data-patch-map-product="patch-map"]').length ?? 0,
        released: shouldRelease,
      };
    }, { bridgeName: bridgeName, shouldRelease: armed }).catch(() => null);
    invariant(
      cleanup?.canvasCount === 0 && cleanup?.released === armed,
      'VIE-001 trusted input probe releases its Engine and canvas',
    );
  }
}
export async function verifyPointerRootInput(page, caseId, bridgeName) {
  invariant(
    caseId === 'EVT-003' || caseId === 'EVT-008' || caseId === 'ACC-002',
    `unsupported trusted pointer case ${caseId}`,
  );
  const contextMenuProbeName = '__PATCH_MAP_NATIVE_CONTEXT_MENU_PROBE__';
  let armed = false;
  let cleanup = null;
  try {
    const gesturePlan = await page.evaluate(async (bridgeName) => {
      const bridge = window[bridgeName];
      if (!bridge) throw new Error('PatchMap pointer focused Lab bridge is unavailable');
      return bridge.armGesture(0);
    }, bridgeName);
    armed = true;

    const canvas = page.locator(gesturePlan.ownerQualifiedTarget);
    await canvas.waitFor({ state: 'visible', timeout: 30_000 });
    await canvas.scrollIntoViewIfNeeded();
    const bounds = await canvas.boundingBox();
    invariant(bounds !== null, `${caseId} trusted input canvas bounds`);
    const pagePoint = (anchor) => ({
      x: bounds.x + anchor.x * bounds.width / 800,
      y: bounds.y + anchor.y * bounds.height / 600,
    });

    if (caseId === 'ACC-002') {
      const owned = pagePoint(gesturePlan.cssLocalAnchors[0]);
      await page.mouse.click(owned.x, owned.y);
      await page.waitForFunction(
        async (bridgeName) => {
          const observation = await window[bridgeName]?.actualObservation();
          return Array.isArray(observation?.snapshot?.selectionIds) &&
            observation.snapshot.selectionIds.length === 1 &&
            observation.snapshot.selectionIds[0] === 'rect-b' &&
            observation.accessibility?.focusedId === 'rect-b' &&
            observation.accessibility?.targets?.['rect-b']
              ?.performedActions?.includes('activate');
        },
        bridgeName,
        { timeout: 10_000 },
      );
    } else if (caseId === 'EVT-003') {
      const hovered = pagePoint(gesturePlan.cssLocalAnchors[0]);
      const viewport = page.viewportSize();
      const right = bounds.x + bounds.width + 8;
      const left = bounds.x - 8;
      const outside = {
        x: viewport !== null && right < viewport.width ? right : left,
        y: bounds.y + Math.min(bounds.height / 2, 100),
      };
      await page.mouse.move(hovered.x, hovered.y);
      await page.mouse.move(outside.x, outside.y);
      await page.waitForFunction(
        async (bridgeName) => {
          const observation = await window[bridgeName]?.actualObservation();
          if (!Array.isArray(observation?.events)) return false;
          const hoverEvents = observation.events.filter((event) => event?.type === 'hover-change');
          return hoverEvents.some((event) => event.payload?.target?.id === 'item-a') &&
            hoverEvents.some((event) => event.payload?.target === null);
        },
        bridgeName,
        { timeout: 10_000 },
      );
    } else {
      await page.evaluate((probeName) => {
        const state = [];
        const listener = (event) => {
          state.push({
            clientX: event.clientX,
            clientY: event.clientY,
            defaultPrevented: event.defaultPrevented,
          });
        };
        document.addEventListener('contextmenu', listener);
        window[probeName] = { listener, state };
      }, contextMenuProbeName);
      const owned = pagePoint(gesturePlan.cssLocalAnchors[0]);
      const empty = pagePoint(gesturePlan.cssLocalAnchors[1]);
      await page.mouse.click(owned.x, owned.y, { button: 'right' });
      await page.mouse.click(empty.x, empty.y, { button: 'right' });
      await page.waitForFunction(
        async ({ bridgeName, probeName }) => {
          const observation = await window[bridgeName]?.actualObservation();
          const clicks = Array.isArray(observation?.events)
            ? observation.events.filter((event) =>
                event?.type === 'click' && event.payload?.button === 2)
            : [];
          return clicks.length === 2 && window[probeName]?.state?.length === 2;
        },
        { bridgeName: bridgeName, probeName: contextMenuProbeName },
        { timeout: 10_000 },
      );
    }

    const observed = await page.evaluate(async ({ bridgeName, probeName }) => {
      const observation = await window[bridgeName].actualObservation();
      return {
        events: observation.events,
        pointerGesture: observation.pointerGesture,
        ownership: observation.ownership,
        accessibility: observation.accessibility,
        snapshot: observation.snapshot,
        resources: observation.resources,
        nativeContextMenu: window[probeName]?.state ?? null,
      };
    }, { bridgeName: bridgeName, probeName: contextMenuProbeName });

    invariant(
      observed.ownership?.rootBindingCount === 6 &&
        observed.ownership?.rootListenerCount === 8 &&
        observed.ownership?.entityCallbackCount === 0,
      `${caseId} trusted input retains eight root-only listeners`,
    );
    invariant(
      observed.pointerGesture?.activePointerCount === 0 &&
        observed.pointerGesture?.pointerCaptureCount === 0 &&
        observed.pointerGesture?.activeGestureCount === 0,
      `${caseId} trusted input releases pointer and gesture ownership`,
    );
    invariant(
      observed.resources?.canvasCount === 1 &&
        observed.resources?.pendingWork === 0,
      `${caseId} trusted input keeps one settled live canvas`,
    );

    if (caseId === 'ACC-002') {
      invariant(
        sameJson(observed.snapshot?.selectionIds, ['rect-b']),
        `ACC-002 trusted accessibility click selection: ${
          JSON.stringify(observed.snapshot?.selectionIds)
        }`,
      );
      invariant(
        observed.accessibility?.focusedId === 'rect-b' &&
          observed.accessibility?.surface?.focusedId === 'rect-b' &&
          observed.accessibility?.surface?.shadowDomNodeCount === 3 &&
          observed.accessibility?.surface?.rootListenerCount === 1 &&
          observed.accessibility?.surface?.entityListenerCount === 0,
        `ACC-002 trusted accessibility bridge: ${
          JSON.stringify(observed.accessibility)
        }`,
      );
      invariant(
        observed.accessibility?.targets?.['rect-b']?.performedActions?.includes('activate') &&
          observed.accessibility.targets['rect-b'].performedActions.includes('select'),
        'ACC-002 trusted accessibility click emits one semantic activation',
      );
      return {
        status: 'passed',
        driverId: gesturePlan.driverId,
        selectedTargets: observed.snapshot.selectionIds,
        focusedId: observed.accessibility.focusedId,
        shadowDomFocusedId:
          observed.accessibility.surface.shadowDomFocusedId,
        shadowDomNodeCount:
          observed.accessibility.surface.shadowDomNodeCount,
        pointerGesture: observed.pointerGesture,
        ownership: observed.ownership,
      };
    }

    if (caseId === 'EVT-003') {
      const hoverTargets = observed.events
        .filter((event) => event?.type === 'hover-change')
        .map((event) => event.payload?.target?.id ?? null);
      invariant(
        hoverTargets.includes('item-a') && hoverTargets.at(-1) === null,
        `EVT-003 trusted hover enter/leave trace: ${JSON.stringify(hoverTargets)}`,
      );
      invariant(
        observed.pointerGesture?.hoverTarget === null,
        'EVT-003 trusted pointerleave clears hover state',
      );
      return {
        status: 'passed',
        driverId: gesturePlan.driverId,
        hoverTargets,
        pointerGesture: observed.pointerGesture,
        ownership: observed.ownership,
      };
    }

    const secondaryClicks = observed.events.filter((event) =>
      event?.type === 'click' && event.payload?.button === 2);
    const secondaryTargets = secondaryClicks.map((event) => event.payload?.target?.id ?? null);
    invariant(
      secondaryTargets.length === 2 &&
        secondaryTargets[0] === 'rect-b' &&
        secondaryTargets[1] === null,
      `EVT-008 trusted secondary click targets: ${JSON.stringify(secondaryTargets)}`,
    );
    invariant(
      secondaryClicks.every((event) => event.payload?.clickCount === 1),
      'EVT-008 trusted secondary clicks each count one physical completion',
    );
    invariant(
      observed.nativeContextMenu?.length === 2 &&
        observed.nativeContextMenu[0]?.defaultPrevented === true &&
        observed.nativeContextMenu[1]?.defaultPrevented === false,
      `EVT-008 contextmenu ownership: ${JSON.stringify(observed.nativeContextMenu)}`,
    );
    return {
      status: 'passed',
      driverId: gesturePlan.driverId,
      secondaryTargets,
      contextMenuDefaultPrevented: observed.nativeContextMenu.map(
        ({ defaultPrevented }) => defaultPrevented,
      ),
      pointerGesture: observed.pointerGesture,
      ownership: observed.ownership,
    };
  } finally {
    cleanup = await page.evaluate(async ({ bridgeName, probeName, shouldRelease }) => {
      const nativeContextMenuProbe = window[probeName];
      if (nativeContextMenuProbe) {
        document.removeEventListener('contextmenu', nativeContextMenuProbe.listener);
        delete window[probeName];
      }
      const bridge = window[bridgeName];
      if (bridge && shouldRelease) await bridge.awaitMilestone(0, 'released');
      const host = document.querySelector('[data-contract-surface]');
      return {
        canvasCount:
          host?.querySelectorAll('canvas[data-patch-map-product="patch-map"]').length ?? 0,
        released: shouldRelease,
      };
    }, {
      bridgeName: bridgeName,
      probeName: contextMenuProbeName,
      shouldRelease: armed,
    }).catch(() => null);
    invariant(
      cleanup?.canvasCount === 0 && cleanup?.released === armed,
      `${caseId} trusted input probe releases its Engine and canvas`,
    );
  }
}
