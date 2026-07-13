import {
  createHost,
  fixedInitOptions,
  normalizeEventArgs,
  normalizeReturn,
  snapshotDom,
  snapshotPatchmap,
} from '../lib/public-observers.mjs';

const lif001 = {
  id: 'LIF-001',
  level: 1,
  title: 'Async idempotent initialization publishes ready state before event',
  invocation: [
    'new Patchmap()',
    "on('patchmap:initialized', callback)",
    'init(host, fixedOptions) without awaiting the call expression',
    'await first init result',
    'init(host, fixedOptions) again',
    'await second init result',
  ],
  timingBoundaries: ['call-return', 'promise-resolution', 'event-callback'],
  volatileFields: [],
  async run({ Patchmap }) {
    const host = createHost();
    const patchmap = new Patchmap();
    const trace = [];
    patchmap.on('patchmap:initialized', (...args) => {
      trace.push({
        event: 'patchmap:initialized',
        args: normalizeEventArgs(args, patchmap),
        stateAtCallback: snapshotPatchmap(patchmap),
        domAtCallback: snapshotDom(host),
      });
    });

    const firstPromise = patchmap.init(host, fixedInitOptions());
    const firstCallReturn = {
      thenable: typeof firstPromise?.then === 'function',
      state: snapshotPatchmap(patchmap),
    };
    const firstResolved = await firstPromise;
    const afterFirstResolve = {
      value: normalizeReturn(firstResolved, { patchmap }),
      state: snapshotPatchmap(patchmap),
      dom: snapshotDom(host),
    };

    const publicReferences = {
      app: patchmap.app,
      viewport: patchmap.viewport,
      world: patchmap.world,
      stateManager: patchmap.stateManager,
      undoRedoManager: patchmap.undoRedoManager,
    };
    const secondPromise = patchmap.init(host, fixedInitOptions());
    const secondCallReturn = {
      thenable: typeof secondPromise?.then === 'function',
      state: snapshotPatchmap(patchmap),
    };
    const secondResolved = await secondPromise;
    const afterSecondResolve = {
      value: normalizeReturn(secondResolved, { patchmap }),
      state: snapshotPatchmap(patchmap),
      dom: snapshotDom(host),
      preservesPublicReferences: Object.fromEntries(
        Object.entries(publicReferences).map(([key, value]) => [
          key,
          patchmap[key] === value,
        ]),
      ),
    };

    patchmap.destroy();
    return {
      firstCallReturn,
      afterFirstResolve,
      secondCallReturn,
      afterSecondResolve,
      eventTrace: trace,
    };
  },
};

const lif002 = {
  id: 'LIF-002',
  level: 1,
  title: 'Destroy is pre-init safe, one-shot, and allows re-initialization',
  invocation: [
    'new Patchmap()',
    "on('patchmap:destroyed', callback)",
    'destroy() before init',
    'await init(host, fixedOptions)',
    'destroy()',
    'destroy() again',
    'await init(host, fixedOptions) on the same instance',
    'destroy() for final cleanup',
  ],
  timingBoundaries: ['synchronous destroy return', 'init promise resolution'],
  volatileFields: [],
  async run({ Patchmap }) {
    const host = createHost();
    const patchmap = new Patchmap();
    const trace = [];
    const subscribe = (subscriptionPhase) => {
      for (const event of ['patchmap:initialized', 'patchmap:destroyed']) {
        patchmap.on(event, (...args) => {
        trace.push({
          subscriptionPhase,
          event,
          args: normalizeEventArgs(args, patchmap),
          stateAtCallback: snapshotPatchmap(patchmap),
          domAtCallback: snapshotDom(host),
        });
        });
      }
    };
    subscribe('initial');

    const preInitReturn = patchmap.destroy();
    const afterPreInitDestroy = {
      value: normalizeReturn(preInitReturn, { patchmap }),
      state: snapshotPatchmap(patchmap),
      dom: snapshotDom(host),
    };

    await patchmap.init(host, fixedInitOptions());
    const afterInit = {
      state: snapshotPatchmap(patchmap),
      dom: snapshotDom(host),
    };

    const firstDestroyReturn = patchmap.destroy();
    const afterFirstDestroy = {
      value: normalizeReturn(firstDestroyReturn, { patchmap }),
      state: snapshotPatchmap(patchmap),
      dom: snapshotDom(host),
    };
    subscribe('after-first-destroy');
    const secondDestroyReturn = patchmap.destroy();
    const afterSecondDestroy = {
      value: normalizeReturn(secondDestroyReturn, { patchmap }),
      state: snapshotPatchmap(patchmap),
      dom: snapshotDom(host),
    };

    await patchmap.init(host, fixedInitOptions());
    const afterReinit = {
      state: snapshotPatchmap(patchmap),
      dom: snapshotDom(host),
    };
    patchmap.destroy();
    const afterFinalDestroy = {
      state: snapshotPatchmap(patchmap),
      dom: snapshotDom(host),
    };

    return {
      afterPreInitDestroy,
      afterInit,
      afterFirstDestroy,
      afterSecondDestroy,
      afterReinit,
      afterFinalDestroy,
      eventTrace: trace,
    };
  },
};

export const lifecycleFixtures = [lif001, lif002];
