import datasets from '../fixtures/datasets/index';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPatchMapApi } from '../../src/public';

import {
  PatchMap,
  type PatchMapEngineSurface,
  type PatchMapPoint,
  type PatchMapSurfaceDebug,
  type PatchMapSurfaceGeometrySnapshot,
  type PatchMapSurfaceOptions,
  type PatchMapSurfaceViewportInput,
  type PatchMapSurfaceView,
} from '../../src/engine';
import type { PatchMapViewportPolicy } from '../../src/viewport';

describe('PatchMap viewport authority', () => {
  const engines: PatchMap[] = [];

  afterEach(async () => {
    await Promise.all(engines.splice(0).map((engine) => engine.destroy()));
  });

  it('animates on the managed loop, preserves the viewport, and stops after completion', async () => {
    const { engine, surface } = await createEngine(engines, 'rotation-animation');
    engine.loadDataset(datasets['all-kinds-scene']);
    const map = createPatchMapApi(engine);
    map.viewport.restore({ centerWorld: [200, 150], scale: 2 });
    engine.accessibilityTree();
    const viewport = map.viewport.snapshot();
    const data = map.data.snapshot();
    const history = engine.historyState();
    const driver = rotationFrameDriver();
    engine.createFrameLoop({ driver });
    const animation = map.rotation.animateTo(360, { durationMs: 100 });
    expect(map.rotation.value).toBe(0);
    expect(driver.pending()).toBe(1);
    driver.fire(0);
    const refreshes = surface.accessibilityRefreshCount;
    driver.fire(50);
    expect(map.rotation.value).toBeCloseTo(315, 0);
    expect(surface.accessibilityRefreshCount).toBe(refreshes + 1);
    expect(map.viewport.snapshot()).toEqual(viewport);
    driver.fire(100);
    await expect(animation.finished).resolves.toEqual({ status: 'completed', angle: 360 });
    expect(animation.cancel()).toBe(false);
    expect(map.rotation.value).toBe(360);
    // A view invalidation during publication can leave one coalesced idle frame.
    if (driver.pending()) driver.fire(116);
    expect(driver.pending()).toBe(0);
    expect(map.data.snapshot()).toEqual(data);
    expect(engine.historyState()).toEqual(history);
  });

  it.each([
    { from: 270, target: 0, path: 'clockwise', midpoint: 348.75, end: 360 },
    { from: 90, target: 0, path: 'counterclockwise', midpoint: 11.25, end: 0 },
    { from: 350, target: 10, path: 'shortest', midpoint: 367.5, end: 370 },
    { from: 10, target: 350, path: 'shortest', midpoint: -7.5, end: -10 },
    { from: 810, target: 0, path: 'shortest', midpoint: 731.25, end: 720 },
    { from: -90, target: 0, path: 'clockwise', midpoint: -11.25, end: 0 },
    { from: 0, target: 180, path: 'shortest', midpoint: 157.5, end: 180 },
    { from: 180, target: 0, path: 'shortest', midpoint: 337.5, end: 360 },
    { from: 360.1, target: 180.1, path: 'shortest', midpoint: 517.6, end: 540.1 },
    { from: 0, target: 180, path: 'counterclockwise', midpoint: -157.5, end: -180 },
    { from: 90, target: -90, path: 'shortest', midpoint: 247.5, end: 270 },
    { from: 350, target: 10, path: 'raw', midpoint: 52.5, end: 10 },
  ] as const)('follows $path from $from to bearing $target without implicit normalization', async (test) => {
    const { engine } = await createEngine(engines, 'rotation-path');
    const map = createPatchMapApi(engine);
    map.rotation.set(test.from);
    const animation = map.rotation.animateTo(test.target, { path: test.path, durationMs: 100 });
    expect(map.rotation.value).toBe(test.from);
    engine.publishFrame(50, 50);
    expect(map.rotation.value).toBeCloseTo(test.midpoint);
    engine.publishFrame(100, 50);
    await expect(animation.finished).resolves.toEqual({ status: 'completed', angle: test.end });
    expect(map.rotation.value).toBe(test.end);
  });

  it('normalizes after the final published frame without adding a second viewport update', async () => {
    const { engine, surface } = await createEngine(engines, 'rotation-path-normalization');
    engine.loadDataset(datasets['all-kinds-scene']);
    const map = createPatchMapApi(engine);
    map.viewport.restore({ centerWorld: [200, 150], scale: 2 });
    map.rotation.set(810);
    const viewport = map.viewport.snapshot();
    const data = map.data.snapshot();
    const history = engine.historyState();
    const publishedAngles: number[] = [];
    vi.spyOn(surface, 'publishFrame').mockImplementation(() => { publishedAngles.push(map.rotation.value); });
    const frameAngles: number[] = [];
    engine.on('frame', () => { frameAngles.push(map.rotation.value); });
    const viewChanges: number[] = [];
    const release = engine.onViewportChange(() => { viewChanges.push(map.rotation.value); });
    const animation = map.rotation.animateTo(0, {
      path: 'shortest', normalizeOnComplete: true, durationMs: 100,
    });
    engine.publishFrame(50, 50);
    expect(map.rotation.value).toBe(731.25);
    engine.publishFrame(100, 50);
    await expect(animation.finished).resolves.toEqual({ status: 'completed', angle: 0 });
    expect(publishedAngles).toEqual([731.25, 720]);
    expect(frameAngles).toEqual([731.25, 0]);
    expect(viewChanges).toEqual(publishedAngles);
    expect(map.viewport.snapshot()).toEqual(viewport);
    expectPointClose(engine.screenToWorld({ x: 400, y: 300 }), { x: 200, y: 150 });
    expectPointClose(engine.screenToWorld({ x: 420, y: 300 }), { x: 210, y: 150 });
    expect(map.data.snapshot()).toEqual(data);
    expect(engine.historyState()).toEqual(history);
    release();
  });

  it('cycles normalized bearings without accumulating turns, including raw full-turn normalization', async () => {
    const { engine } = await createEngine(engines, 'rotation-bearing-cycle');
    const map = createPatchMapApi(engine);
    let time = 0;
    for (const target of [90, 180, 270, 0, 90, 180, 270, 0]) {
      const animation = map.rotation.animateTo(target, {
        path: 'clockwise', normalizeOnComplete: true, durationMs: 100,
      });
      engine.publishFrame(time += 50, 50);
      engine.publishFrame(time += 50, 50);
      await expect(animation.finished).resolves.toEqual({ status: 'completed', angle: target });
      expect(map.rotation.value).toBe(target);
    }
    const fullTurns = map.rotation.animateTo(720, { normalizeOnComplete: true, durationMs: 100 });
    engine.publishFrame(time += 50, 50);
    expect(map.rotation.value).toBe(630);
    engine.publishFrame(time + 50, 50);
    await expect(fullTurns.finished).resolves.toEqual({ status: 'completed', angle: 0 });
    const negative = map.rotation.animateTo(-450, { durationMs: 0, normalizeOnComplete: true });
    await expect(negative.finished).resolves.toEqual({ status: 'completed', angle: 270 });
  });

  it('treats equivalent directed bearings as unchanged and handles immediate normalized completion', async () => {
    const { engine, surface } = await createEngine(engines, 'rotation-equivalent-bearing');
    const map = createPatchMapApi(engine);
    map.rotation.set(810);
    const changes = surface.setViewCount;
    for (const path of ['shortest', 'clockwise', 'counterclockwise'] as const) {
      await expect(map.rotation.animateTo(90, { path }).finished)
        .resolves.toEqual({ status: 'completed', angle: 810 });
    }
    expect(surface.setViewCount).toBe(changes);
    await expect(map.rotation.animateTo(90, { path: 'clockwise', normalizeOnComplete: true }).finished)
      .resolves.toEqual({ status: 'completed', angle: 90 });
    expect(engine.rotationAnimationActive).toBe(false);
    map.rotation.set(810);
    engine.setReducedMotion(true);
    await expect(map.rotation.animateTo(0, { path: 'shortest', normalizeOnComplete: true }).finished)
      .resolves.toEqual({ status: 'completed', angle: 0 });
    const zero = map.rotation.animateTo(-360, { path: 'clockwise', normalizeOnComplete: true });
    await expect(zero.finished).resolves.toEqual({ status: 'completed', angle: 0 });
    expect(Object.is(map.rotation.value, -0)).toBe(false);
  });

  it('does not add a nearly full turn for equivalent fractional bearings', async () => {
    const { engine, surface } = await createEngine(engines, 'rotation-fractional-bearing');
    const map = createPatchMapApi(engine);
    for (const from of [360.1, -359.9, 810.1]) {
      map.rotation.set(from);
      const target = from === 810.1 ? 90.1 : 0.1;
      const changes = surface.setViewCount;
      for (const path of ['clockwise', 'counterclockwise', 'shortest'] as const) {
        await expect(map.rotation.animateTo(target, { path }).finished)
          .resolves.toEqual({ status: 'completed', angle: from });
        expect(engine.rotationAnimationActive).toBe(false);
      }
      expect(surface.setViewCount).toBe(changes);
    }
  });

  it('keeps interrupted angles unwrapped and uses the current angle when retargeting', async () => {
    const { engine } = await createEngine(engines, 'rotation-path-cancel');
    const map = createPatchMapApi(engine);
    map.rotation.set(10);
    const cancelled = map.rotation.animateTo(350, {
      path: 'shortest', normalizeOnComplete: true, durationMs: 100,
    });
    engine.publishFrame(50, 50);
    expect(map.rotation.value).toBe(-7.5);
    expect(cancelled.cancel()).toBe(true);
    await expect(cancelled.finished).resolves.toEqual({ status: 'cancelled', angle: -7.5 });
    expect(map.rotation.value).toBe(-7.5);
    const replaced = map.rotation.animateTo(270, { path: 'counterclockwise', durationMs: 100 });
    engine.publishFrame(100, 50);
    const current = map.rotation.value;
    const final = map.rotation.animateTo(0, { path: 'shortest', normalizeOnComplete: true, durationMs: 100 });
    expect(map.rotation.value).toBe(current);
    await expect(replaced.finished).resolves.toEqual({ status: 'cancelled', angle: current });
    engine.publishFrame(200, 100);
    await expect(final.finished).resolves.toEqual({ status: 'completed', angle: 0 });
  });

  it('makes normalized completion available to settled listeners without normalizing cancellation', async () => {
    const { engine } = await createEngine(engines, 'rotation-path-settled');
    const map = createPatchMapApi(engine);
    vi.useFakeTimers();
    try {
      const saved: number[] = [];
      const release = map.viewport.onSettled(() => { saved.push(map.rotation.value); });
      map.rotation.set(810);
      const animation = map.rotation.animateTo(0, { path: 'shortest', normalizeOnComplete: true, durationMs: 100 });
      engine.publishFrame(50, 50);
      await vi.advanceTimersByTimeAsync(200);
      expect(saved).toEqual([]);
      engine.publishFrame(100, 50);
      await animation.finished;
      await vi.advanceTimersByTimeAsync(100);
      expect(saved).toEqual([0]);
      map.rotation.set(10);
      const interrupted = map.rotation.animateTo(350, { path: 'shortest', normalizeOnComplete: true, durationMs: 100 });
      engine.publishFrame(150, 50);
      map.viewport.panBy([10, 0]);
      await expect(interrupted.finished).resolves.toEqual({ status: 'cancelled', angle: -7.5 });
      await vi.advanceTimersByTimeAsync(100);
      expect(saved).toEqual([0, -7.5]);
      release();
    } finally { vi.useRealTimers(); }
  });

  it('does not normalize when the final frame fails or is cancelled reentrantly', async () => {
    const { engine, surface } = await createEngine(engines, 'rotation-final-normalization');
    const map = createPatchMapApi(engine);
    map.rotation.set(810);
    const failure = map.rotation.animateTo(0, { path: 'shortest', normalizeOnComplete: true, durationMs: 100 });
    vi.spyOn(surface, 'publishFrame').mockImplementationOnce(() => { throw new Error('final frame failed'); });
    expect(() => engine.publishFrame(100, 100)).toThrow();
    await expect(failure.finished).resolves.toEqual({ status: 'failed', angle: 720 });
    expect(map.rotation.value).toBe(720);
    map.rotation.set(810);
    const interrupted = map.rotation.animateTo(0, { path: 'shortest', normalizeOnComplete: true, durationMs: 100 });
    const release = engine.onViewportChange(() => { interrupted.cancel(); });
    engine.publishFrame(200, 100);
    await expect(interrupted.finished).resolves.toEqual({ status: 'cancelled', angle: 720 });
    expect(map.rotation.value).toBe(720);
    release();
  });

  it('rejects invalid path options and unrepresentable directed angles before interruption', async () => {
    const { engine } = await createEngine(engines, 'rotation-path-validation');
    const map = createPatchMapApi(engine);
    const animation = map.rotation.animateTo(90);
    for (const path of ['cw', '', null, 1]) {
      expect(() => map.rotation.animateTo(180, { path: path as 'raw' })).toThrow(TypeError);
    }
    for (const normalizeOnComplete of [null, 1, 'true']) {
      expect(() => map.rotation.animateTo(180, { normalizeOnComplete: normalizeOnComplete as unknown as boolean })).toThrow(TypeError);
    }
    expect(engine.rotationAnimationActive).toBe(true);
    animation.cancel();
    map.rotation.set(Number.MAX_VALUE);
    const raw = map.rotation.animateTo(0);
    expect(() => map.rotation.animateTo(90, { path: 'shortest' })).toThrow(RangeError);
    expect(engine.rotationAnimationActive).toBe(true);
    raw.cancel();
    map.rotation.set(Number.MAX_SAFE_INTEGER - 1000);
    expect(() => map.rotation.animateTo(90.5, { path: 'clockwise' })).toThrow(RangeError);
    map.rotation.set(0);
    await expect(map.rotation.animateTo(Number.MAX_VALUE, {
      path: 'clockwise', normalizeOnComplete: true, durationMs: 0,
    }).finished).resolves.toEqual({ status: 'completed', angle: Number.MAX_VALUE % 360 });
  });

  it('excludes idle time before a rotation request from its first frame', async () => {
    const { engine } = await createEngine(engines, 'rotation-idle');
    const map = createPatchMapApi(engine);
    const driver = rotationFrameDriver();
    const loop = engine.createFrameLoop({ driver });
    loop.publishNow();
    driver.setTime(10000);
    const animation = map.rotation.animateTo(90, { durationMs: 50 });
    driver.fire(10016);
    expect(map.rotation.value).toBeCloseTo(90 * (1 - 0.68 ** 3));
    expect(engine.rotationAnimationActive).toBe(true);
    driver.fire(10050);
    await expect(animation.finished).resolves.toEqual({ status: 'completed', angle: 90 });
  });

  it('advances rotation every frame while bulk presentation is throttled', async () => {
    const { engine } = await createEngine(engines, 'rotation-budget');
    const map = createPatchMapApi(engine);
    vi.spyOn(engine, 'activeAnimations', 'get').mockReturnValue(5000);
    vi.spyOn(engine, 'frameWorkloadSize', 'get').mockReturnValue(5000);
    const driver = rotationFrameDriver();
    engine.createFrameLoop({ driver });
    map.rotation.animateTo(90, { durationMs: 100 });
    driver.fire(0);
    const first = map.rotation.value;
    driver.fire(16);
    const second = map.rotation.value;
    driver.fire(32);
    expect(engine.frameTimeMs).toBe(0);
    expect(second).toBeGreaterThan(first);
    expect(map.rotation.value).toBeGreaterThan(second);
    driver.fire(82);
    driver.fire(100);
    expect(map.rotation.value).toBe(90);
  });

  it('retargets without jumping and validates before interrupting an active request', async () => {
    const { engine } = await createEngine(engines, 'rotation-retarget');
    const map = createPatchMapApi(engine);
    const first = map.rotation.animateTo(90, { durationMs: 100 });
    engine.publishFrame(50, 50);
    expect(map.rotation.value).toBe(78.75);
    for (const angle of [NaN, Infinity, -Infinity]) {
      expect(() => map.rotation.animateTo(angle)).toThrow(RangeError);
    }
    for (const durationMs of [NaN, Infinity, -1, null, '100']) {
      expect(() => map.rotation.animateTo(180, { durationMs: durationMs as number })).toThrow(RangeError);
    }
    expect(engine.rotationAnimationActive).toBe(true);
    const next = map.rotation.animateTo(-90, { durationMs: 100 });
    expect(map.rotation.value).toBe(78.75);
    await expect(first.finished).resolves.toEqual({ status: 'cancelled', angle: 78.75 });
    expect(first.cancel()).toBe(false);
    engine.publishFrame(100, 50);
    expect(map.rotation.value).toBeCloseTo(-68.90625);
    expect(next.cancel()).toBe(true);
    const stopped = map.rotation.value;
    engine.publishFrame(150, 50);
    expect(map.rotation.value).toBe(stopped);
    await expect(next.finished).resolves.toEqual({ status: 'cancelled', angle: stopped });
  });

  it('cancels on direct rotation and navigation, but preserves animation through resize and hiding', async () => {
    const { engine, surface } = await createEngine(engines, 'rotation-interruption');
    const map = createPatchMapApi(engine);
    for (const interrupt of [
      () => map.rotation.set(20),
      () => map.rotation.reset(),
      () => { map.rotation.value = 30; },
      () => map.viewport.panBy([10, 0]),
      () => map.viewport.zoomBy(1.1),
      () => map.viewport.restore({ centerWorld: [0, 0], scale: 1 }),
      () => surface.emitViewportInput({ source: 'pointer', centerWorld: [10, 10], scale: 1 }),
    ]) {
      const animation = map.rotation.animateTo(90);
      interrupt();
      await expect(animation.finished).resolves.toMatchObject({ status: 'cancelled' });
      expect(engine.rotationAnimationActive).toBe(false);
    }
    const driver = rotationFrameDriver();
    engine.createFrameLoop({ driver });
    const animation = map.rotation.animateTo(180, { durationMs: 100 });
    driver.fire(0);
    driver.fire(25);
    const before = map.rotation.value;
    map.viewport.resize(1000, 700, 1);
    expect(map.rotation.value).toBe(before);
    engine.setDocumentVisibility({ state: 'hidden', timeMs: 25 });
    expect(driver.pending()).toBe(0);
    engine.publishFrame(5000, 50);
    expect(map.rotation.value).toBe(before);
    engine.setDocumentVisibility({ state: 'visible', timeMs: 5000 });
    driver.fire(5000);
    expect(map.rotation.value).toBeCloseTo(before, 0);
    driver.fire(5050);
    driver.fire(5100);
    await expect(animation.finished).resolves.toEqual({ status: 'completed', angle: 180 });
  });

  it('settles only after animation ends, including explicit cancellation', async () => {
    const { engine } = await createEngine(engines, 'rotation-settled');
    const map = createPatchMapApi(engine);
    vi.useFakeTimers();
    try {
      const settled = vi.fn();
      const release = map.viewport.onSettled(settled);
      const animation = map.rotation.animateTo(90, { durationMs: 1000 });
      engine.publishFrame(10, 10);
      await vi.advanceTimersByTimeAsync(500);
      expect(settled).not.toHaveBeenCalled();
      animation.cancel();
      await vi.advanceTimersByTimeAsync(100);
      expect(settled).toHaveBeenCalledTimes(1);
      const completing = map.rotation.animateTo(180, { durationMs: 100 });
      engine.publishFrame(110, 100);
      await completing.finished;
      await vi.advanceTimersByTimeAsync(100);
      expect(settled).toHaveBeenCalledTimes(2);
      release();
    } finally { vi.useRealTimers(); }
  });

  it('keeps reentrant replacement current and applies a changed reduced-motion preference', async () => {
    const { engine } = await createEngine(engines, 'rotation-reentrant');
    const map = createPatchMapApi(engine);
    let replacement: ReturnType<typeof map.rotation.animateTo> | undefined;
    const release = engine.onViewportChange(() => {
      if (replacement === undefined) replacement = map.rotation.animateTo(180);
    });
    const original = map.rotation.animateTo(90, { durationMs: 100 });
    engine.publishFrame(100, 100);
    release();
    await expect(original.finished).resolves.toEqual({ status: 'cancelled', angle: 90 });
    expect(engine.rotationAnimationActive).toBe(true);
    engine.setReducedMotion(true);
    engine.publishFrame(116, 16);
    await expect(replacement?.finished).resolves.toEqual({ status: 'completed', angle: 180 });
    expect(map.rotation.value).toBe(180);
    expect(engine.rotationAnimationActive).toBe(false);
  });

  it('handles reduced motion, extreme angles, frame failure, and destruction', async () => {
    const { engine, surface } = await createEngine(engines, 'rotation-lifecycle');
    const map = createPatchMapApi(engine);
    engine.setReducedMotion(true);
    await expect(map.rotation.animateTo(90).finished).resolves.toEqual({ status: 'completed', angle: 90 });
    expect(map.rotation.value).toBe(90);
    engine.setReducedMotion(false);
    await expect(map.rotation.animateTo(0, { durationMs: 0 }).finished).resolves.toEqual({ status: 'completed', angle: 0 });
    map.rotation.set(-Number.MAX_VALUE);
    const extreme = map.rotation.animateTo(Number.MAX_VALUE, { durationMs: 100 });
    engine.publishFrame(50, 50);
    expect(Number.isFinite(map.rotation.value)).toBe(true);
    engine.publishFrame(100, 50);
    await expect(extreme.finished).resolves.toEqual({ status: 'completed', angle: Number.MAX_VALUE });
    const failing = map.rotation.animateTo(0);
    vi.spyOn(surface, 'publishFrame').mockImplementationOnce(() => { throw new Error('frame failed'); });
    expect(() => engine.publishFrame(150, 50)).toThrow();
    await expect(failing.finished).resolves.toMatchObject({ status: 'failed' });
    const pending = map.rotation.animateTo(90);
    await engine.destroy();
    await expect(pending.finished).resolves.toMatchObject({ status: 'cancelled' });
    expect(pending.cancel()).toBe(false);
    expect(() => map.rotation.animateTo(0)).toThrow();
  });

  it('exposes centered whole-map rotation without editing data or history', async () => {
    const { engine, surface } = await createEngine(engines, 'public-rotation');
    engine.loadDataset(datasets['all-kinds-scene']);
    const map = createPatchMapApi(engine);
    map.viewport.restore({ centerWorld: [200, 150], scale: 2 });
    engine.accessibilityTree();
    const data = map.data.snapshot();
    const history = engine.historyState();
    const before = engine.snapshot().revisions;
    const refreshes = surface.accessibilityRefreshCount;
    const viewport = map.viewport.snapshot();

    expect(map.rotation.value).toBe(0);
    expect(map.rotation.set(90)).toBe(90);
    expect(map.viewport.snapshot()).toEqual(viewport);
    expectPointClose(engine.screenToWorld({ x: 400, y: 300 }), { x: 200, y: 150 });
    expectPointClose(engine.screenToWorld({ x: 400, y: 320 }), { x: 210, y: 150 });
    expect(surface.accessibilityRefreshCount).toBe(refreshes + 1);
    expect(engine.snapshot().revisions).toEqual({ ...before, viewRevision: before.viewRevision + 1 });

    const setViewCount = surface.setViewCount;
    map.rotation.set(90);
    expect(surface.setViewCount).toBe(setViewCount);
    expect(engine.snapshot().revisions.viewRevision).toBe(before.viewRevision + 1);
    expect(map.rotation.rotateBy(-135)).toBe(-45);
    map.rotation.value = 450;
    expect(map.rotation.value).toBe(450);
    expect(map.rotation.reset()).toBe(0);
    expect(map.rotation.value).toBe(0);
    expect(map.data.snapshot()).toEqual(data);
    expect(engine.historyState()).toEqual(history);

    const revisions = engine.snapshot().revisions;
    for (const invalid of [NaN, Infinity, -Infinity, '90', null]) {
      expect(() => map.rotation.set(invalid as number)).toThrow(RangeError);
      expect(() => map.rotation.rotateBy(invalid as number)).toThrow(RangeError);
    }
    expect(() => { map.rotation.value = NaN; }).toThrow(RangeError);
    expect(map.rotation.value).toBe(0);
    expect(engine.snapshot().revisions).toEqual(revisions);
    map.rotation.set(Number.MAX_VALUE);
    expect(() => map.rotation.rotateBy(Number.MAX_VALUE)).toThrow(RangeError);
    map.rotation.reset();

    const rejectView = vi.spyOn(surface, 'setView').mockImplementationOnce(() => {
      throw new Error('surface refused rotation');
    });
    const beforeFailure = engine.snapshot().revisions;
    expect(() => map.rotation.set(30)).toThrow('surface refused rotation');
    expect(map.rotation.value).toBe(0);
    expect(engine.snapshot().revisions).toEqual(beforeFailure);
    rejectView.mockRestore();
    await engine.destroy();
    expect(() => map.rotation.set(90)).toThrow();
  });

  it('keeps navigation, fit, resize, and coalesced settlement coherent after rotation', async () => {
    const { engine, surface } = await createEngine(engines, 'public-rotation-navigation');
    engine.loadDataset(datasets['all-kinds-scene']);
    const map = createPatchMapApi(engine);
    vi.useFakeTimers();
    try {
      const settled = vi.fn();
      const release = map.viewport.onSettled(settled);
      map.rotation.set(90);
      map.rotation.rotateBy(45);
      vi.advanceTimersByTime(100);
      expect(settled).toHaveBeenCalledTimes(1);
      map.rotation.set(135);
      vi.advanceTimersByTime(100);
      expect(settled).toHaveBeenCalledTimes(1);

      const point = { x: 200, y: 150 };
      const beforePan = engine.screenToWorld(point);
      map.viewport.panBy([40, -20]);
      expectPointClose(engine.screenToWorld({ x: point.x + 40, y: point.y - 20 }), beforePan);
      const anchor = { x: 520, y: 360 };
      const beforeZoom = engine.screenToWorld(anchor);
      map.viewport.zoomBy(1.5, [anchor.x, anchor.y]);
      expectPointClose(engine.screenToWorld(anchor), beforeZoom);

      map.viewport.fit({ targets: [{ id: 'item-a' }, { id: 'rect-b' }], padding: 24 });
      expect(targetsInsideViewport(surface.geometrySnapshot().entities, ['item-a', 'rect-b'], [800, 600])).toBe(true);
      const snapshot = map.viewport.snapshot();
      map.viewport.resize(1024, 768, 2);
      expect(map.viewport.snapshot()).toEqual(snapshot);
      expectPointClose(engine.screenToWorld({ x: 512, y: 384 }), {
        x: snapshot.centerWorld[0], y: snapshot.centerWorld[1],
      });
      map.viewport.restore({ centerWorld: [20, 30], scale: 1 });
      expect(map.rotation.value).toBe(135);
      expectPointClose(engine.screenToWorld({ x: 512, y: 384 }), { x: 20, y: 30 });
      release();
      vi.advanceTimersByTime(100);
      expect(settled).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps cursor and pinch anchors stable while pan and deceleration use one view owner', async () => {
    const { engine } = await createEngine(engines, 'viewport-navigation');
    const anchor = { x: 520, y: 360 };

    const pan = engine.panViewport([40, -20], 'pointer');
    expect(pan).toMatchObject({
      changed: true,
      blocked: false,
      viewport: { centerWorld: [360, 320] },
    });

    const beforeWheel = engine.screenToWorld(anchor);
    const wheel = engine.zoomViewportAt({
      factor: 1.5,
      anchorCss: [anchor.x, anchor.y],
      source: 'modifier-wheel',
    });
    const afterWheel = engine.screenToWorld(anchor);
    expect(wheel.viewport.scale).toBe(1.5);
    expectPointClose(afterWheel, beforeWheel);

    const beforePinch = engine.screenToWorld(anchor);
    engine.zoomViewportAt({
      factor: 1.25,
      anchorCss: [anchor.x, anchor.y],
      source: 'pinch',
    });
    expectPointClose(engine.screenToWorld(anchor), beforePinch);

    expect(engine.startViewportDeceleration([0.5, -0.25])).toBe(true);
    engine.advanceViewportMotion(16);
    engine.advanceViewportMotion(32);
    engine.advanceViewportMotion(64);
    engine.advanceViewportMotion(128);
    engine.advanceViewportMotion(256);
    const settled = engine.settleViewport();
    expect(settled).toMatchObject({
      changed: true,
      publicationCount: 1,
      persistence: { settled: true },
    });
    expect(engine.viewportProbe().scale).toBeGreaterThanOrEqual(0.25);
    expect(engine.viewportProbe().scale).toBeLessThanOrEqual(4);
  });

  it('publishes root surface gestures through the same revision and persistence authority', async () => {
    const { engine, surface } = await createEngine(engines, 'viewport-root-input');
    const events: PatchMapSurfaceViewportInput[] = [];
    const unbind = engine.on('viewChanged', (event) => {
      if (
        event.source === 'pointer' ||
        event.source === 'middle-pointer' ||
        event.source === 'wheel'
      ) {
        events.push(Object.freeze({
          source: event.source,
          centerWorld: event.viewport.centerWorld,
          scale: event.viewport.scale,
        }));
      }
    });
    const before = engine.snapshot().revisions;

    surface.emitViewportInput({
      source: 'middle-pointer',
      centerWorld: [240, 180],
      scale: 2,
    });

    expect(engine.viewportProbe()).toMatchObject({
      centerWorld: [240, 180],
      scale: 2,
    });
    expect(engine.snapshot().revisions).toMatchObject({
      sceneRevision: before.sceneRevision,
      viewRevision: before.viewRevision + 1,
      interactionRevision: before.interactionRevision,
    });
    expect(engine.screenToWorld({ x: 400, y: 300 })).toEqual({ x: 240, y: 180 });
    expect(events).toEqual([{
      source: 'middle-pointer',
      centerWorld: [240, 180],
      scale: 2,
    }]);
    expect(engine.settleViewport().changed).toBe(true);
    expect(engine.serializeViewport()).toMatchObject({
      centerWorld: [240, 180],
      scale: 2,
    });
    expect(surface.viewportInputBindingCount).toBe(1);

    unbind();
    await engine.destroy();
    expect(surface.viewportInputBindingCount).toBe(0);
  });

  it('refreshes active accessibility geometry for programmatic and root-surface view commits', async () => {
    const { engine, surface } = await createEngine(engines, 'viewport-accessibility');
    engine.loadDataset(datasets['all-kinds-scene']);
    engine.accessibilityTree();
    const before = surface.accessibilityRefreshCount;

    engine.setViewport({ centerWorld: [200, 150], scale: 1.5 });
    expect(surface.accessibilityRefreshCount).toBe(before + 1);

    surface.emitViewportInput({
      source: 'wheel',
      centerWorld: [240, 180],
      scale: 2,
    });
    expect(surface.accessibilityRefreshCount).toBe(before + 2);
    expect(engine.viewportProbe()).toMatchObject({
      centerWorld: [240, 180],
      scale: 2,
    });
  });

  it('focuses and fits hierarchy-aware contributors without moving on empty or invalid input', async () => {
    const { engine, surface } = await createEngine(engines, 'viewport-targets');
    engine.loadDataset(datasets['all-kinds-scene']);
    engine.setViewport({ centerWorld: [0, 0], scale: 2 });

    const explicit = engine.focusViewport({ targets: ['rect-b'] });
    expect(explicit).toMatchObject({
      status: 'applied',
      contributors: [expect.objectContaining({ id: 'rect-b' })],
      viewport: { scale: 2 },
    });
    expect(screenBoundsCenter(surface.geometrySnapshot().entities, 'rect-b')).toEqual([400, 300]);
    expect(engine.focusViewport({ targets: ['links'] }).contributors.map(({ id }) => id))
      .toEqual(['item-a', 'rect-b']);
    expect(engine.focusViewport({
      targets: ['group-a'],
      rejectIds: ['rect-b'],
    }).contributors.map(({ id }) => id)).toEqual(['item-a']);

    const beforeEmpty = engine.viewportProbe();
    expect(engine.focusViewport({ targets: ['missing'] })).toMatchObject({
      status: 'empty',
      applied: [],
      missing: ['missing'],
    });
    expect(engine.viewportProbe()).toEqual(beforeEmpty);

    engine.setWorldTransform({ rotationDegrees: 90, flipX: true, flipY: false });
    const fit = engine.fitViewport({
      targets: ['item-a', 'rect-b'],
      paddingCssPx: [20, 30],
    });
    expect(fit).toMatchObject({
      status: 'applied',
      paddingCssPx: [20, 30],
    });
    expect(fit.viewport.scale).toBeGreaterThan(0);
    expect(targetsInsideViewport(
      surface.geometrySnapshot().entities,
      ['item-a', 'rect-b'],
      [800, 600],
    )).toBe(true);

    const beforeInvalid = engine.viewportProbe();
    expect(() => engine.fitViewport({
      targets: ['item-a'],
      paddingCssPx: [-1, 16],
    })).toThrow('viewport padding must contain two finite non-negative values');
    expect(engine.viewportProbe()).toEqual(beforeInvalid);

    expect(engine.resize(1024, 768, 1)).toBe(true);
    expect(targetsInsideViewport(
      surface.geometrySnapshot().entities,
      ['item-a', 'rect-b'],
      [1024, 768],
    )).toBe(true);
  });

  it('preserves authored world angles and correlates each changed resize to one current pointer transform', async () => {
    const { engine, surface } = await createEngine(engines, 'viewport-world-transform');
    engine.loadDataset(datasets['all-kinds-scene']);
    engine.setViewport({ centerWorld: [200, 150], scale: 1 });
    const resizeEvents: string[] = [];
    engine.on('viewChanged', ({ source }) => {
      if (source === 'resize') resizeEvents.push(source);
    });

    expect(engine.setWorldTransform({
      rotationDegrees: 90,
      flipX: false,
      flipY: false,
    })).toEqual({
      rotationDegrees: 90,
      flipX: false,
      flipY: false,
    });
    expect(engine.setWorldTransform({
      rotationDegrees: 45,
      flipX: true,
      flipY: false,
    })).toEqual({
      rotationDegrees: 45,
      flipX: true,
      flipY: false,
    });
    expect(engine.setWorldTransform({
      rotationDegrees: 450,
      flipX: true,
      flipY: true,
    })).toEqual({
      rotationDegrees: 450,
      flipX: true,
      flipY: true,
    });
    expect(engine.viewportProbe().centerWorld).toEqual([200, 150]);
    expect(engine.screenToWorld({ x: 400, y: 300 })).toEqual({ x: 200, y: 150 });

    const beforeInvalid = engine.viewportTransformProbe();
    expect(() => engine.setWorldTransform({
      rotationDegrees: Number.NaN,
      flipX: false,
      flipY: false,
    })).toThrow('rotationDegrees must be finite');
    expect(engine.viewportTransformProbe()).toEqual(beforeInvalid);

    const setViewCountBefore = surface.setViewCount;
    const resizeProbeBefore = engine.viewportTransformProbe();
    expect(engine.resize(1024, 768, 2)).toBe(true);
    expect(surface.setViewCount - setViewCountBefore).toBe(1);
    expect(engine.viewportTransformProbe()).toMatchObject({
      pointerTransformRevision: engine.snapshot().revisions.viewRevision,
      resizePolicyApplicationCount:
        resizeProbeBefore.resizePolicyApplicationCount + 1,
      blackFrameCount: 0,
      pendingResizeFrame: true,
      surface: {
        canvasCount: 1,
        cssSize: [1024, 768],
        backingSize: [2048, 1536],
      },
    });

    const resizeDebugCount = surface.debugSnapshotCount;
    engine.publishFrame(1);
    expect(surface.debugSnapshotCount).toBe(resizeDebugCount + 1);
    expect(engine.viewportTransformProbe()).toMatchObject({
      pointerTransformRevision: engine.snapshot().revisions.viewRevision,
      blackFrameCount: 0,
      pendingResizeFrame: false,
    });
    const settledDebugCount = surface.debugSnapshotCount;
    engine.publishFrame(1.5);
    expect(surface.debugSnapshotCount).toBe(settledDebugCount);
    const afterPublishedResize = engine.viewportTransformProbe();
    expect(engine.resize(1024, 768, 2)).toBe(false);
    expect(engine.viewportTransformProbe()).toEqual(afterPublishedResize);

    surface.visiblePrimitiveCount = 0;
    expect(engine.resize(900, 700, 1)).toBe(true);
    engine.publishFrame(2);
    expect(engine.viewportTransformProbe()).toMatchObject({
      blackFrameCount: 1,
      pendingResizeFrame: false,
    });
    expect(resizeEvents).toEqual(['resize', 'resize']);
  });

  it('settles and serializes once, restores valid state, and falls back from invalid state', async () => {
    const first = await createEngine(engines, 'viewport-persist-1');
    first.engine.loadDataset(datasets['all-kinds-scene']);
    first.engine.setViewport({ centerWorld: [200, 150], scale: 1.5 });
    expect(first.engine.settleViewport().changed).toBe(true);
    expect(first.engine.settleViewport().changed).toBe(false);
    const saved = first.engine.serializeViewport();
    expect(first.engine.serializeViewport()).toBe(saved);
    expect(first.engine.viewportPersistenceProbe()).toMatchObject({
      settledPublicationCount: 1,
      persistenceWriteCount: 1,
      equivalentSaveCount: 0,
      suppressedEquivalentSaveCount: 1,
    });

    const second = await createEngine(engines, 'viewport-persist-2');
    second.engine.loadDataset(datasets['all-kinds-scene']);
    expect(second.engine.restoreViewport(saved)).toMatchObject({
      status: 'restored',
      viewport: { centerWorld: [200, 150], scale: 1.5 },
    });
    const fallback = second.engine.restoreViewport({
      centerWorld: [Number.NaN, 150],
      scale: 0,
    });
    expect(fallback).toMatchObject({
      status: 'fallback:auto-fit',
      fit: { status: 'applied' },
    });
    expect(Number.isFinite(fallback.viewport.scale)).toBe(true);
    expect(fallback.viewport.scale).toBeGreaterThan(0);
  });

  it('applies idempotent policy lifecycle and exposes zero owned resources after destroy', async () => {
    const { engine, surface } = await createEngine(engines, 'viewport-policy');
    const initial = engine.viewportPolicyProbe();

    engine.configureViewportPolicy({ op: 'stop', policy: 'pan' });
    expect(engine.panViewport([20, 10], 'pointer')).toMatchObject({
      changed: false,
      blocked: true,
    });
    engine.configureViewportPolicy({ op: 'start', policy: 'pan' });
    const doubleStart = engine.configureViewportPolicy({ op: 'start', policy: 'pan' });
    expect(doubleStart.callbacksByPolicy.pan).toBe(1);

    engine.configureViewportPolicy({ op: 'temporary', policy: 'edge-pan' });
    expect(engine.viewportPolicyProbe().enabledPolicies).toContain('edge-pan');
    engine.configureViewportPolicy({ op: 'restore-temporary' });
    expect(engine.viewportPolicyProbe().policies).toEqual(initial.policies);
    expect(engine.viewportPolicyProbe().enabledPolicies).toEqual(initial.enabledPolicies);

    engine.configureViewportPolicy({ op: 'remove', policy: 'pan' });
    expect(engine.panViewport([20, 10], 'pointer').blocked).toBe(true);
    engine.configureViewportPolicy({ op: 'cancel-all' });
    expect(surface.cancelCount).toBeGreaterThan(0);
    await engine.destroy();
    expect(engine.viewportPolicyProbe()).toMatchObject({
      policies: [],
      enabledPolicies: [],
      destroyed: true,
      resources: {
        tickers: 0,
        listeners: 0,
        captures: 0,
        motions: 0,
        cursors: 0,
      },
    });
  });

  it('rebinds a host lifecycle without rebuilding the GPU surface and invalidates old target authority', async () => {
    const { engine, surface } = await createEngine(engines, 'viewport-host-rebind');
    engine.loadDataset(datasets['all-kinds-scene']);
    const resolved = engine.resolveTarget({ kind: 'element', id: 'item-a' });
    expect(resolved).not.toBeNull();
    if (resolved === null) throw new Error('expected item-a target authority');
    engine.select(['item-a']);
    engine.startViewportDeceleration([0.5, -0.25]);
    const before = engine.snapshot();

    const rebound = engine.rebindHostLifecycle(2);

    expect(rebound).toMatchObject({
      lifecycleGeneration: 2,
      sceneRevision: before.revisions.sceneRevision,
      canvasCount: 1,
      selectionIds: [],
      revisions: {
        lifecycleGeneration: 2,
        sceneRevision: before.revisions.sceneRevision,
      },
    });
    expect(surface.destroyed).toBe(false);
    expect(engine.snapshot()).toMatchObject({
      lifecycle: 'scene-ready',
      revisions: {
        lifecycleGeneration: 2,
        sceneRevision: before.revisions.sceneRevision,
      },
      selectionIds: [],
      resources: { canvasCount: 1 },
    });
    expect(engine.advanceViewportMotion(16)).toMatchObject({
      changed: false,
      blocked: true,
    });
    expect(engine.patchResolved(resolved, {})).toMatchObject({
      status: 'rejected',
      diagnostic: { code: 'STALE_TARGET' },
    });
    expect(() => engine.rebindHostLifecycle(4)).toThrow(
      'host lifecycle generation must advance by exactly one',
    );
  });

  it('cancels a cooperative load before surface publication when the host lifecycle advances', async () => {
    let releaseLoad!: () => void;
    let markLoadEntered!: () => void;
    const loadGate = new Promise<void>((resolve) => {
      releaseLoad = resolve;
    });
    const loadEntered = new Promise<void>((resolve) => {
      markLoadEntered = resolve;
    });
    let surface: CooperativeViewportSurface | null = null;
    const engine = new PatchMap({
      surfaceFactory: (options) => {
        surface = new CooperativeViewportSurface(
          options,
          loadGate,
          markLoadEntered,
        );
        return Promise.resolve(surface);
      },
    });
    engines.push(engine);
    await engine.initialize({
      instanceId: 'viewport-cooperative-load',
      width: 800,
      height: 600,
      pixelRatio: 1,
    });

    const pending = engine.loadDatasetAsync(
      datasets['all-kinds-scene'],
    );
    await loadEntered;
    expect(engine.snapshot().pendingWork).toBe(1);
    engine.rebindHostLifecycle(2);
    releaseLoad();

    await expect(pending).rejects.toMatchObject({
      diagnostic: { code: 'SUPERSEDED', operation: 'loadDatasetAsync' },
    });
    const observedSurface = surface as CooperativeViewportSurface | null;
    if (observedSurface === null) throw new Error('cooperative surface was not created');
    expect(observedSurface.cooperativeCommitCount).toBe(0);
    expect(engine.snapshot()).toMatchObject({
      lifecycle: 'ready-empty',
      rootIds: [],
      pendingWork: 0,
      revisions: {
        lifecycleGeneration: 2,
        sceneRevision: 0,
      },
    });
  });
});

class ViewportSurface implements PatchMapEngineSurface {
  public canvasCount = 1;
  public destroyed = false;
  public cancelCount = 0;
  public setViewCount = 0;
  public accessibilityRefreshCount = 0;
  public debugSnapshotCount = 0;
  public visiblePrimitiveCount = WORLD_ENTITIES.length;
  private width: number;
  private height: number;
  private pixelRatio: number;
  private view: PatchMapSurfaceView;
  private policies: readonly PatchMapViewportPolicy[] = Object.freeze([]);
  private viewportInputListener:
    | ((input: PatchMapSurfaceViewportInput) => void)
    | null = null;
  private zoomLimits: readonly [number, number] = Object.freeze([0.01, 100]);

  public constructor(options: PatchMapSurfaceOptions) {
    this.width = options.width;
    this.height = options.height;
    this.pixelRatio = options.pixelRatio;
    this.view = Object.freeze({ x: 0, y: 0, scale: 1, rotation: 0 });
  }

  public load(): void {}
  public reconcile(_input: unknown) { return committedReconcile(); }
  public publishFrame(): void {}

  public resize(width: number, height: number, pixelRatio: number): boolean {
    const changed =
      width !== this.width ||
      height !== this.height ||
      pixelRatio !== this.pixelRatio;
    this.width = width;
    this.height = height;
    this.pixelRatio = pixelRatio;
    return changed;
  }

  public setView(view: PatchMapSurfaceView): void {
    this.view = Object.freeze({ ...view });
    this.setViewCount += 1;
  }

  public setAccessibilityTree(): undefined {
    this.accessibilityRefreshCount += 1;
    return undefined;
  }

  public setViewportGesturePolicies(policies: readonly PatchMapViewportPolicy[]): void {
    this.policies = Object.freeze([...policies]);
  }

  public setViewportZoomLimits(limits: readonly [number, number]): void {
    this.zoomLimits = Object.freeze([limits[0], limits[1]]);
  }

  public bindViewportInput(
    listener: (input: PatchMapSurfaceViewportInput) => void,
  ): () => void {
    if (this.viewportInputListener !== null) {
      throw new Error('viewport input listener already bound');
    }
    this.viewportInputListener = listener;
    return () => {
      if (this.viewportInputListener === listener) this.viewportInputListener = null;
    };
  }

  public get viewportInputBindingCount(): 0 | 1 {
    return this.viewportInputListener === null ? 0 : 1;
  }

  public emitViewportInput(input: PatchMapSurfaceViewportInput): void {
    if (input.scale < this.zoomLimits[0] || input.scale > this.zoomLimits[1]) {
      throw new RangeError('simulated viewport input exceeds zoom limits');
    }
    this.view = Object.freeze({
      ...this.view,
      x: this.width / 2 - input.centerWorld[0] * input.scale,
      y: this.height / 2 - input.centerWorld[1] * input.scale,
      scale: input.scale,
    });
    this.viewportInputListener?.(Object.freeze({
      source: input.source,
      centerWorld: Object.freeze([
        input.centerWorld[0],
        input.centerWorld[1],
      ] as const),
      scale: input.scale,
    }));
  }

  public cancelViewportGestures(): void {
    this.cancelCount += 1;
  }

  public select(): void {}

  public hitTestScreen(): string | null {
    return null;
  }

  public screenToWorld(point: PatchMapPoint): PatchMapPoint {
    const radians = this.view.rotation * Math.PI / 180;
    const cosine = Math.cos(radians);
    const sine = Math.sin(radians);
    const orientedX = (point.x - this.view.x) * (this.view.flipX ? -1 : 1);
    const orientedY = (point.y - this.view.y) * (this.view.flipY ? -1 : 1);
    return Object.freeze({
      x: (orientedX * cosine + orientedY * sine) / this.view.scale,
      y: (-orientedX * sine + orientedY * cosine) / this.view.scale,
    });
  }

  public geometrySnapshot(): PatchMapSurfaceGeometrySnapshot {
    const entities = WORLD_ENTITIES.map((entity) => Object.freeze({
      ...entity,
      screenBounds: projectBounds(entity.worldBounds, this.view),
      visibleBounds: entity.worldBounds,
      interactive: true,
    }));
    return Object.freeze({
      revision: 1,
      sceneRevision: 1,
      entities: Object.freeze(entities),
      relations: Object.freeze([
        Object.freeze({
          id: 'links:0',
          relationId: 'links',
          sourceId: 'item-a',
          targetId: 'item-a',
          worldBounds: Object.freeze([10, 20, 100, 80] as const),
          screenBounds: projectBounds([10, 20, 100, 80], this.view),
          visible: true,
          worldEndpoints: Object.freeze([
            Object.freeze([60, 60] as const),
            Object.freeze([60, 60] as const),
          ] as const),
          screenEndpoints: Object.freeze([
            toScreen([60, 60], this.view),
            toScreen([60, 60], this.view),
          ] as const),
        }),
        Object.freeze({
          id: 'links:1',
          relationId: 'links',
          sourceId: 'item-a',
          targetId: 'rect-b',
          worldBounds: Object.freeze([10, 20, 190, 80] as const),
          screenBounds: projectBounds([10, 20, 190, 80], this.view),
          visible: true,
          worldEndpoints: Object.freeze([
            Object.freeze([60, 60] as const),
            Object.freeze([180, 55] as const),
          ] as const),
          screenEndpoints: Object.freeze([
            toScreen([60, 60], this.view),
            toScreen([180, 55], this.view),
          ] as const),
        }),
      ]),
      omittedRelations: Object.freeze([]),
      selectionOverlay: null,
    });
  }

  public debugSnapshot(): PatchMapSurfaceDebug {
    this.debugSnapshotCount += 1;
    return Object.freeze({
      cssSize: Object.freeze([this.width, this.height] as const),
      backingSize: Object.freeze([
        this.width * this.pixelRatio,
        this.height * this.pixelRatio,
      ] as const),
      selectionIds: Object.freeze([]),
      activeAnimationCount: 0,
      activeGestureCount: 0,
      renderCommandCount: 1,
      visiblePrimitiveCount: this.visiblePrimitiveCount,
    });
  }

  public destroy(): Promise<boolean> {
    if (this.destroyed) return Promise.resolve(false);
    this.destroyed = true;
    this.canvasCount = 0;
    this.policies = Object.freeze([]);
    this.viewportInputListener = null;
    return Promise.resolve(true);
  }
}

function committedReconcile() {
  return Object.freeze({
    status: 'committed' as const,
    operationCount: 0,
    denseChanged: false,
    diagnostics: Object.freeze([]),
  });
}

class CooperativeViewportSurface extends ViewportSurface {
  public cooperativeCommitCount = 0;

  public constructor(
    options: PatchMapSurfaceOptions,
    private readonly loadGate: Promise<void>,
    private readonly markLoadEntered: () => void,
  ) {
    super(options);
  }

  public async loadAsync(
    _input: unknown,
    assertCurrent?: () => void,
  ): Promise<void> {
    this.markLoadEntered();
    await this.loadGate;
    assertCurrent?.();
    this.cooperativeCommitCount += 1;
  }
}

const WORLD_ENTITIES = Object.freeze([
  worldEntity('item-a', 'rect', [10, 20, 100, 80]),
  worldEntity('rect-b', 'rect', [160, 40, 40, 30]),
  worldEntity('grid-a.0.0', 'rect', [300, 40, 48, 48]),
  worldEntity('grid-a.0.1', 'rect', [356, 40, 48, 48]),
  worldEntity('image-a', 'image', [-20, 200, 80, 40]),
  worldEntity('text-c', 'text', [40, 140, 80, 20]),
  worldEntity('zone-a', 'rect', [20, 320, 240, 120]),
]);

async function createEngine(
  engines: PatchMap[],
  instanceId: string,
): Promise<Readonly<{ engine: PatchMap; surface: ViewportSurface }>> {
  let surface: ViewportSurface | null = null;
  const engine = new PatchMap({
    surfaceFactory: (options) => {
      surface = new ViewportSurface(options);
      return Promise.resolve(surface);
    },
  });
  engines.push(engine);
  await engine.initialize({
    instanceId,
    width: 800,
    height: 600,
    pixelRatio: 1,
    zoomLimits: [0.25, 4],
  });
  if (surface === null) throw new Error('viewport surface was not created');
  return { engine, surface };
}

function worldEntity(
  id: string,
  kind: string,
  worldBounds: readonly [number, number, number, number],
) {
  return Object.freeze({
    id,
    kind,
    worldBounds: Object.freeze([...worldBounds] as [
      number,
      number,
      number,
      number,
    ]),
    visible: true,
  });
}

function toScreen(
  point: readonly [number, number],
  view: PatchMapSurfaceView,
): readonly [number, number] {
  const scaledX = point[0] * view.scale;
  const scaledY = point[1] * view.scale;
  const radians = view.rotation * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return Object.freeze([
    view.x + (scaledX * cosine - scaledY * sine) * (view.flipX ? -1 : 1),
    view.y + (scaledX * sine + scaledY * cosine) * (view.flipY ? -1 : 1),
  ]);
}

function projectBounds(
  bounds: readonly [number, number, number, number],
  view: PatchMapSurfaceView,
): readonly [number, number, number, number] {
  const corners = [
    toScreen([bounds[0], bounds[1]], view),
    toScreen([bounds[0] + bounds[2], bounds[1]], view),
    toScreen([bounds[0] + bounds[2], bounds[1] + bounds[3]], view),
    toScreen([bounds[0], bounds[1] + bounds[3]], view),
  ];
  const xs = corners.map(([x]) => x);
  const ys = corners.map(([, y]) => y);
  return Object.freeze([
    Math.min(...xs),
    Math.min(...ys),
    Math.max(...xs) - Math.min(...xs),
    Math.max(...ys) - Math.min(...ys),
  ]);
}

function screenBoundsCenter(
  entities: PatchMapSurfaceGeometrySnapshot['entities'],
  id: string,
): readonly [number, number] {
  const entity = entities.find((candidate) => candidate.id === id);
  if (!entity) throw new Error(`missing geometry ${id}`);
  return Object.freeze([
    entity.screenBounds[0] + entity.screenBounds[2] / 2,
    entity.screenBounds[1] + entity.screenBounds[3] / 2,
  ]);
}

function targetsInsideViewport(
  entities: PatchMapSurfaceGeometrySnapshot['entities'],
  ids: readonly string[],
  viewport: readonly [number, number],
): boolean {
  return ids.every((id) => {
    const entity = entities.find((candidate) => candidate.id === id);
    if (!entity) return false;
    const [left, top, width, height] = entity.screenBounds;
    const right = left + width;
    const bottom = top + height;
    return left >= -1e-9 && top >= -1e-9 &&
      right <= viewport[0] + 1e-9 && bottom <= viewport[1] + 1e-9;
  });
}

function expectPointClose(actual: PatchMapPoint, expected: PatchMapPoint): void {
  expect(actual.x).toBeCloseTo(expected.x, 9);
  expect(actual.y).toBeCloseTo(expected.y, 9);
}

function rotationFrameDriver() {
  let now = 0;
  let id = 0;
  const callbacks = new Map<number, FrameRequestCallback>();
  return {
    now: () => now,
    setTime(time: number) { now = time; },
    request(callback: FrameRequestCallback) { callbacks.set(++id, callback); return id; },
    cancel(handle: number) { callbacks.delete(handle); },
    pending: () => callbacks.size,
    fire(time: number) {
      const entry = callbacks.entries().next().value;
      if (!entry) throw new Error('No pending rotation frame');
      callbacks.delete(entry[0]);
      now = time;
      entry[1](time);
    },
  };
}
