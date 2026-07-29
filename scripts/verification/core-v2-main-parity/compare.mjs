const GEOMETRY_ABSOLUTE_TOLERANCE = 2;
const GEOMETRY_RELATIVE_TOLERANCE = 0.03;

export function compareObservations(main, core, image, options = {}) {
  const findings = [];
  exact(findings, 'lifecycle', main.lifecycle, core.lifecycle);
  exact(findings, 'canvas.count', main.canvasCount, core.canvasCount);
  exact(findings, 'canvas.cssSize', main.canvasCssSize, core.canvasCssSize);
  exact(findings, 'canvas.backingSize', main.canvasBackingSize, core.canvasBackingSize);
  exact(findings, 'input.unchanged', main.inputUnchanged, core.inputUnchanged);
  exact(findings, 'selection.ids', main.selectionIds, core.selectionIds);
  exact(findings, 'history.canUndo', main.history.canUndo, core.history.canUndo);
  exact(findings, 'history.canRedo', main.history.canRedo, core.history.canRedo);
  exact(findings, 'world.rotation', normalizeDegrees(main.world.rotationDegrees), normalizeDegrees(core.world.rotationDegrees));
  exact(findings, 'world.flipX', main.world.flipX, core.world.flipX);
  exact(findings, 'world.flipY', main.world.flipY, core.world.flipY);
  if (options.compareViewport === true) {
    compareTuple(
      findings,
      'viewport.centerWorld',
      main.viewport.centerWorld,
      core.viewport.centerWorld,
      0.05,
    );
    compareNumber(
      findings,
      'viewport.scale',
      main.viewport.scale,
      core.viewport.scale,
      0.001,
    );
  }
  compareTransitionInvariants(findings, options.transition ?? null);

  const coreEntities = new Map(core.entities.map((entity) => [entityKey(entity), entity]));
  for (const mainEntity of main.entities) {
    const key = entityKey(mainEntity);
    const coreEntity = coreEntities.get(key);
    if (coreEntity === undefined) {
      findings.push(finding(
        'mismatch',
        `entity.${key}.observation`,
        mainEntity,
        null,
        'Core v2 omitted a main-observed logical id',
      ));
      continue;
    }
    exact(findings, `entity.${key}.present`, mainEntity.present, coreEntity.present);
    if (!mainEntity.present || !coreEntity.present) continue;
    exact(findings, `entity.${key}.visible`, mainEntity.visible, coreEntity.visible);
    if (
      (mainEntity.requestedType === 'text' ||
        coreEntity.requestedType === 'text') &&
      mainEntity.textContent !== null &&
      coreEntity.textContent !== null
    ) {
      exact(
        findings,
        `entity.${key}.textContent`,
        mainEntity.textContent,
        coreEntity.textContent,
      );
    }
    if (
      (mainEntity.requestedType === 'text' ||
        coreEntity.requestedType === 'text') &&
      mainEntity.textPublication !== null &&
      coreEntity.textPublication !== null
    ) {
      exact(
        findings,
        `entity.${key}.textPublication`,
        mainEntity.textPublication,
        coreEntity.textPublication,
      );
    }
    if (geometryComparable(mainEntity, coreEntity)) {
      compareBounds(findings, `entity.${key}.bounds`, mainEntity.bounds, coreEntity.bounds);
    }
  }

  compareMask(findings, image.masks.main, image.masks.core);
  compareEntityRegions(findings, image.regions ?? []);
  const classified = applyAcceptedDifferences(
    findings,
    options.acceptedDifferences ?? [],
    options.checkpointLabel ?? '',
  );
  const mismatchCount = classified.filter(
    ({ classification }) => classification === 'mismatch',
  ).length;
  const toleratedCount = classified.filter(
    ({ classification }) => classification === 'tolerated-raster',
  ).length;
  const acceptedDifferenceCount = classified.length - mismatchCount - toleratedCount;
  return Object.freeze({
    status: mismatchCount === 0 ? 'pass' : 'mismatch',
    mismatchCount,
    toleratedCount,
    acceptedDifferenceCount,
    findings: Object.freeze(classified),
    image,
  });
}

function compareEntityRegions(findings, regions) {
  for (const region of regions) {
    if (
      region.materialPixelDeltaCount >= 48 &&
      region.materialPixelDeltaRatio > 0.02
    ) {
      findings.push(finding(
        'mismatch',
        `image.entity.${region.key}.materialPixelDeltaRatio`,
        region.materialPixelDeltaRatio,
        0,
        `${region.materialPixelDeltaCount} materially different pixels occupy ${round(region.materialPixelDeltaRatio * 100)}% of the leaf comparison region`,
      ));
    } else if (region.exactMismatchRatio > 0.01) {
      findings.push(finding(
        'tolerated-raster',
        `image.entity.${region.key}.exactMismatchRatio`,
        region.exactMismatchRatio,
        0,
        'leaf geometry agrees while antialiasing or subpixel raster coverage differs',
      ));
    }
  }
}

function compareTransitionInvariants(findings, transition) {
  if (transition === null) return;
  const { action } = transition;
  if (action.type === 'set-view') {
    for (const [runtime, record] of runtimeTransitions(transition)) {
      compareExpectedTuple(
        findings,
        `invariant.${runtime}.setView.centerWorld`,
        record.after.viewport.centerWorld,
        action.centerWorld,
        0.05,
      );
      compareExpectedNumber(
        findings,
        `invariant.${runtime}.setView.scale`,
        record.after.viewport.scale,
        action.scale,
        0.001,
      );
    }
    return;
  }
  if (action.type === 'browser-wheel') {
    for (const [runtime, record] of runtimeTransitions(transition)) {
      compareExpectedTuple(
        findings,
        `invariant.${runtime}.wheel.anchorWorld`,
        record.after.viewport.wheelProbeWorld,
        record.before.viewport.wheelProbeWorld,
        0.1,
      );
      const beforeScale = record.before.viewport.scale;
      const afterScale = record.after.viewport.scale;
      const expectedDirection = Math.sign(-(action.deltaY ?? 0));
      const actualDirection = (
        typeof beforeScale === 'number' && typeof afterScale === 'number'
          ? Math.sign(afterScale - beforeScale)
          : 0
      );
      exact(
        findings,
        `invariant.${runtime}.wheel.scaleDirection`,
        expectedDirection,
        actualDirection,
      );
    }
    return;
  }
  if (action.type === 'browser-drag' && action.button === 'middle') {
    const expected = [
      (action.toX ?? action.x ?? 0) - (action.x ?? 0),
      (action.toY ?? action.y ?? 0) - (action.y ?? 0),
    ];
    for (const [runtime, record] of runtimeTransitions(transition)) {
      compareExpectedNumber(
        findings,
        `invariant.${runtime}.pan.scaleStable`,
        record.after.viewport.scale,
        record.before.viewport.scale,
        0.001,
      );
      const beforeCenter = record.before.viewport.centerWorld;
      const afterCenter = record.after.viewport.centerWorld;
      const scale = record.after.viewport.scale;
      const screenDelta = (
        beforeCenter !== null &&
        afterCenter !== null &&
        typeof scale === 'number'
      )
        ? [
            (beforeCenter[0] - afterCenter[0]) * scale,
            (beforeCenter[1] - afterCenter[1]) * scale,
          ]
        : null;
      compareExpectedTuple(
        findings,
        `invariant.${runtime}.pan.cssDelta`,
        screenDelta,
        expected,
        0.25,
      );
    }
    return;
  }
  if (action.type === 'world-transform') {
    for (const [runtime, record] of runtimeTransitions(transition)) {
      compareExpectedTuple(
        findings,
        `invariant.${runtime}.world.centerStable`,
        record.after.viewport.centerWorld,
        record.before.viewport.centerWorld,
        0.05,
      );
      compareExpectedNumber(
        findings,
        `invariant.${runtime}.world.scaleStable`,
        record.after.viewport.scale,
        record.before.viewport.scale,
        0.001,
      );
    }
    return;
  }
  if (
    action.type === 'update-component' &&
    action.changes?.animation === true &&
    Number.isFinite(action.changes?.animationDuration) &&
    action.changes.animationDuration > 0 &&
    Number.isFinite(action.changes?.size?.height)
  ) {
    const key = `${action.ownerId ?? 'unknown'}::${action.componentId ?? 'unknown'}`;
    const destinationHeight = action.changes.size.height;
    for (const [runtime, record] of runtimeTransitions(transition)) {
      compareAnimatedBarStart(
        findings,
        runtime,
        key,
        record.before,
        record.after,
        destinationHeight,
      );
    }
  }
}

function compareAnimatedBarStart(
  findings,
  runtime,
  key,
  beforeObservation,
  afterObservation,
  destinationHeight,
) {
  const before = beforeObservation.entities.find(
    (entity) => entityKey(entity) === key,
  );
  const after = afterObservation.entities.find(
    (entity) => entityKey(entity) === key,
  );
  const beforeBounds = before?.bounds ?? null;
  const afterBounds = after?.bounds ?? null;
  if (beforeBounds === null || afterBounds === null) {
    exact(
      findings,
      `invariant.${runtime}.animatedBar.observable`,
      true,
      false,
    );
    return;
  }
  const startHeight = beforeBounds[3];
  const visibleHeight = afterBounds[3];
  const lower = Math.min(startHeight, destinationHeight) - 0.25;
  const upper = Math.max(startHeight, destinationHeight) + 0.25;
  if (visibleHeight < lower || visibleHeight > upper) {
    findings.push(finding(
      'mismatch',
      `invariant.${runtime}.animatedBar.inFlightRange`,
      [startHeight, destinationHeight],
      visibleHeight,
      'the first painted animation frame left the authored start/destination interval',
    ));
  }
  if (Math.abs(destinationHeight - visibleHeight) <= 0.25) {
    findings.push(finding(
      'mismatch',
      `invariant.${runtime}.animatedBar.notImmediatelySettled`,
      'in-flight',
      visibleHeight,
      'a nonzero-duration bar update painted its destination immediately',
    ));
  }
  compareExpectedNumber(
    findings,
    `invariant.${runtime}.animatedBar.bottomAnchor`,
    afterBounds[1] + afterBounds[3],
    beforeBounds[1] + beforeBounds[3],
    0.75,
  );
}

function runtimeTransitions(transition) {
  return [
    ['main', transition.main],
    ['core', transition.core],
  ];
}

function compareExpectedTuple(findings, path, actual, expected, tolerance) {
  if (actual === null || expected === null || actual === undefined || expected === undefined) {
    exact(findings, path, expected ?? null, actual ?? null);
    return;
  }
  for (let index = 0; index < Math.max(actual.length, expected.length); index += 1) {
    compareExpectedNumber(
      findings,
      `${path}.${index}`,
      actual[index],
      expected[index],
      tolerance,
    );
  }
}

function compareExpectedNumber(findings, path, actual, expected, tolerance) {
  if (
    typeof actual === 'number' &&
    typeof expected === 'number' &&
    Number.isFinite(actual) &&
    Number.isFinite(expected) &&
    Math.abs(actual - expected) <= tolerance
  ) {
    return;
  }
  exact(findings, path, expected, actual);
}

function applyAcceptedDifferences(findings, rules, checkpointLabel) {
  return findings.map((entry) => {
    if (entry.classification !== 'mismatch') return entry;
    const rule = rules.find((candidate) => (
      globMatches(candidate.checkpoint ?? '*', checkpointLabel) &&
      globMatches(candidate.path, entry.path)
    ));
    if (rule === undefined) return entry;
    return finding(
      rule.classification,
      entry.path,
      entry.main,
      entry.core,
      `${rule.reason}; observed: ${entry.detail}`,
    );
  });
}

function globMatches(pattern, value) {
  const expression = String(pattern)
    .split('*')
    .map((part) => part.replaceAll(/[\\^$.*+?()[\]{}|]/gu, '\\$&'))
    .join('.*');
  return new RegExp(`^${expression}$`, 'u').test(value);
}

function compareTuple(findings, path, main, core, tolerance) {
  if (main === null || core === null) {
    exact(findings, path, main, core);
    return;
  }
  for (let index = 0; index < Math.max(main.length, core.length); index += 1) {
    compareNumber(findings, `${path}.${index}`, main[index], core[index], tolerance);
  }
}

function compareNumber(findings, path, main, core, tolerance) {
  if (
    typeof main === 'number' &&
    typeof core === 'number' &&
    Number.isFinite(main) &&
    Number.isFinite(core) &&
    Math.abs(main - core) <= tolerance
  ) {
    return;
  }
  exact(findings, path, main, core);
}

function compareBounds(findings, path, main, core) {
  if (main === null || core === null) {
    exact(findings, path, main, core);
    return;
  }
  const labels = ['x', 'y', 'width', 'height'];
  labels.forEach((label, index) => {
    const delta = Math.abs(main[index] - core[index]);
    const scale = Math.max(1, Math.abs(main[index]), Math.abs(core[index]));
    if (
      delta > GEOMETRY_ABSOLUTE_TOLERANCE
      && delta / scale > GEOMETRY_RELATIVE_TOLERANCE
    ) {
      findings.push(finding(
        'mismatch',
        `${path}.${label}`,
        main[index],
        core[index],
        `semantic geometry differs by ${round(delta)}px`,
      ));
    }
  });
}

function compareMask(findings, main, core) {
  if (main.bounds === null || core.bounds === null) {
    exact(findings, 'image.content.bounds', main.bounds, core.bounds);
    return;
  }
  const deltas = main.bounds.map((value, index) => Math.abs(value - core.bounds[index]));
  const material = deltas.some((delta, index) => {
    const scale = Math.max(1, main.bounds[index], core.bounds[index]);
    return delta > 6 && delta / scale > 0.05;
  });
  if (material) {
    findings.push(finding(
      'mismatch',
      'image.content.bounds',
      main.bounds,
      core.bounds,
      'visible non-background content occupies a materially different region',
    ));
  } else {
    const ratioDelta = Math.abs(main.pixelRatio - core.pixelRatio);
    if (ratioDelta > 0.01) {
      findings.push(finding(
        'tolerated-raster',
        'image.content.pixelRatio',
        main.pixelRatio,
        core.pixelRatio,
        'content footprint matches while raster coverage differs',
      ));
    }
  }
}

function exact(findings, path, main, core) {
  if (JSON.stringify(main) === JSON.stringify(core)) return;
  findings.push(finding(
    'mismatch',
    path,
    main,
    core,
    'observable values differ',
  ));
}

function finding(classification, path, main, core, detail) {
  return Object.freeze({ classification, path, main, core, detail });
}

function normalizeDegrees(value) {
  const normalized = value % 360;
  return Object.is(normalized, -0) ? 0 : normalized < 0 ? normalized + 360 : normalized;
}

function entityKey(entity) {
  return entity.scope === 'component'
    ? `${entity.ownerId ?? 'unknown'}::${entity.id}`
    : entity.id;
}

function geometryComparable(main, core) {
  if (main.scope === 'component' || core.scope === 'component') return true;
  return !['group', 'grid', 'item'].includes(main.requestedType)
    && !['group', 'grid', 'item'].includes(core.requestedType);
}

function round(value) {
  return Math.round(value * 1_000) / 1_000;
}
