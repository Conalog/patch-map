import bindingFieldsFixture from '../../conformance/fixtures/binding-fields.json';
import { PatchMap, PatchMapAssetRuntime } from '../../src/index';
import structuralFixture from '../../conformance/fixtures/structural.json';
import editorLifecycleFixture from '../../conformance/fixtures/editor-lifecycle.json';
import controllerFixture from '../../conformance/fixtures/controller.json';
import transformGeometryFixture from '../../conformance/fixtures/transform-geometry.json';
export const EXTRA_TRACE_FIXTURES: readonly SharedFixture[] = [controllerFixture, transformGeometryFixture, editorLifecycleFixture, structuralFixture, bindingFieldsFixture];
import type {
  PatchMapInstance, PatchMapUpdate, PatchMapUpdateOptions, PatchMapUpdateBatch,
  PatchMapUpdateBatchOptions, PatchMapTransactionOperation, PatchMapTransactionOptions,
  PatchMapDataReplaceOptions, PatchMapEditorWorkflowAction, PatchMapSelectionInput,
  PatchMapTargetSet, PatchMapTargetQuery, PatchMapTransformSession, PatchMapRotationAnimation, PatchMapPresentationLayer,
  PatchMapTarget, PatchMapFitOptions, PatchMapViewportSnapshot, PatchMapAssetRegistration,
} from '../../src/index';

export interface SharedCommand {
  readonly id: string;
  readonly op: string;
  readonly input?: unknown;
  readonly options?: unknown;
  readonly refs?: Readonly<Record<string, string | undefined>>;
  readonly expect?: Readonly<Record<string, unknown>>;
}
export interface SharedFixture {
  readonly schemaRevision: string;
  readonly id: string;
  readonly surface: { readonly width: number; readonly height: number; readonly pixelRatio: number; readonly background?: string };
  readonly dataset: readonly unknown[];
  readonly commands: readonly SharedCommand[];
  readonly assets?: readonly PatchMapAssetRegistration[];
  readonly requiredAssets?: readonly string[];
}

/** Acquire actual codecs through the exported runtime/session contract. */
export async function acquireSharedFixtureAssets(fixture: SharedFixture) {
  if (!fixture.assets?.length) return { runtime: undefined, dispose: async () => {} };
  const runtime = new PatchMapAssetRuntime();
  const session = runtime.createSession({ instanceId: `conformance-${fixture.id}` });
  try {
    session.registerAssets(fixture.assets);
    await Promise.all((fixture.requiredAssets ?? []).map((alias) => session.acquire(alias)));
    return { runtime, dispose: () => session.destroy() };
  } catch (error) {
    await session.destroy();
    throw error;
  }
}

/** Public API observations deliberately omit backend-specific renderer counters. */
export function observePublic(instance: PatchMapInstance) {
  const debug = instance.debug.snapshot();
  return {
    dataset: instance.data.snapshot(),
    semanticHash: debug.semanticHash,
    rootIds: debug.rootIds,
    history: instance.history.state,
    selectionIds: instance.selection.ids,
    editor: instance.editor.state,
    viewport: instance.viewport.state,
    rotation: instance.rotation.value,
    targets: instance.targets.query({ scope: 'all' }).matches,
  };
}

const handles = new WeakMap<PatchMapInstance, Map<string, unknown>>();
function stored<T>(instance: PatchMapInstance, name: string | undefined): T {
  const value = name === undefined ? undefined : handles.get(instance)?.get(name);
  if (value === undefined) throw new Error(`Missing fixture handle ${String(name)}`);
  return value as T;
}
function store(instance: PatchMapInstance, name: string, value: unknown): void {
  let values = handles.get(instance); if (!values) { values = new Map(); handles.set(instance, values); } values.set(name, value);
}

export async function executeSharedCommand(instance: PatchMapInstance, command: SharedCommand): Promise<unknown> {
  const input = command.input as Record<string, unknown> | undefined;
  switch (command.op) {
    case 'callbacks.probe': {
      const target = String(input!.target);
      const deliveries: string[] = [];
      const initialDepth = instance.history.state.cursor;
      const mutate = (fill: string) => instance.update({ id: target, changes: { fill } });
      if (input!.scenario === 'history-reentry') {
        let nested = false;
        const a = instance.history.onChange((state) => {
          deliveries.push(`a:${state.cursor - initialDepth}`);
          if (!nested) { nested = true; mutate('#00aa00'); }
        });
        const b = instance.history.onChange((state) => deliveries.push(`b:${state.cursor - initialDepth}`));
        try { mutate('#aa0000'); } finally { a(); b(); }
      } else if (input!.scenario === 'failure-disposer') {
        let b = () => {};
        const a = instance.history.onChange(() => { deliveries.push('a'); b(); throw new Error('fixture callback failure'); });
        b = instance.history.onChange(() => deliveries.push('disposed'));
        const c = instance.history.onChange(() => deliveries.push('c'));
        try { mutate('#0000aa'); } finally { a(); b(); c(); }
        mutate('#aaaa00');
      } else if (input!.scenario === 'transform-reentry') {
        const session = instance.transform.beginSession({ targets: { id: target }, kind: 'move', actionId: 'callback-drag' });
        session.preview({ kind: 'move', delta: [8, 0] });
        const release = instance.history.onChange(() => {
          try { session.edgePan([479, 260], [4, 0]); deliveries.push('accepted'); }
          catch { deliveries.push('settled'); }
        });
        try { session.commit(); } finally { release(); }
      } else { throw new Error('Unknown callback scenario'); }
      return { deliveries };
    }
    case 'update': return instance.update(command.input as PatchMapUpdate, command.options as PatchMapUpdateOptions | undefined);
    case 'updateBatch': return instance.updateBatch(command.refs?.targets ? { ...(command.input as PatchMapUpdateBatch), targets: stored<PatchMapTargetSet>(instance, command.refs.targets) } : command.input as PatchMapUpdateBatch, command.options as PatchMapUpdateBatchOptions | undefined);
    case 'transaction': return instance.transaction(command.input as readonly PatchMapTransactionOperation[], command.options as PatchMapTransactionOptions | undefined);
    case 'data.replace': return instance.data.replace(command.input, command.options as PatchMapDataReplaceOptions | undefined);
    case 'data.replaceAsync': return instance.data.replaceAsync(command.input, command.options as PatchMapDataReplaceOptions | undefined);
    case 'history.undo': return instance.history.undo();
    case 'history.redo': return instance.history.redo();
    case 'history.clear': return instance.history.clear();
    case 'editor.execute': return instance.editor.execute(command.input as PatchMapEditorWorkflowAction);
    case 'selection.set': return instance.selection.set(command.input as PatchMapSelectionInput);
    case 'selection.clear': return instance.selection.clear();
    case 'presentation.clear': return instance.presentation.clear(command.input as string);
    case 'viewport.fit': return instance.viewport.fit(command.input as PatchMapFitOptions | undefined);
    case 'targets.query': { const result = instance.targets.query(command.input as PatchMapTargetQuery); store(instance, command.id, result); return { count: result.count, matches: result.matches }; }
    case 'targets.get': return instance.targets.get(command.input as PatchMapTarget);
    case 'data.serialize': return instance.data.serialize(command.input as boolean | undefined);
    case 'selection.add': return instance.selection.add(command.input as PatchMapSelectionInput);
    case 'selection.remove': return instance.selection.remove(command.input as PatchMapSelectionInput);
    case 'selection.toggle': return instance.selection.toggle(command.input as PatchMapSelectionInput);
    case 'presentation.set': return instance.presentation.set(input!.key as string, { ...(input!.layer as PatchMapPresentationLayer), scope: stored<PatchMapTargetSet>(instance, command.refs?.scope) });
    case 'viewport.panBy': return instance.viewport.panBy(command.input as readonly [number, number]);
    case 'viewport.zoomBy': return instance.viewport.zoomBy(input!.factor as number, input!.anchor as readonly [number, number] | undefined);
    case 'viewport.restore': return instance.viewport.restore(command.input as PatchMapViewportSnapshot);
    case 'viewport.resize': return instance.viewport.resize(input!.width as number, input!.height as number, input!.pixelRatio as number | undefined);
    case 'rotation.set': return instance.rotation.set(command.input as number);
    case 'rotation.rotateBy': return instance.rotation.rotateBy(command.input as number);
    case 'rotation.reset': return instance.rotation.reset();
    case 'rotation.start': { const request = instance.rotation.animateTo(input!.angle as number, command.options as Parameters<typeof instance.rotation.animateTo>[1]); store(instance, command.id, request); return { started: true }; }
    case 'rotation.cancel': return stored<PatchMapRotationAnimation>(instance, command.refs?.animation).cancel();
    case 'rotation.finished': return stored<PatchMapRotationAnimation>(instance, command.refs?.animation).finished;
    case 'transform.moveBy': return instance.transform.moveBy(input!.targets as readonly PatchMapTarget[], input!.delta as readonly [number, number], command.options as Parameters<typeof instance.transform.moveBy>[2]);
    case 'transform.resizeBy': return instance.transform.resizeBy(input!.targets as readonly PatchMapTarget[], input!.resize as Parameters<typeof instance.transform.resizeBy>[1], command.options as Parameters<typeof instance.transform.resizeBy>[2]);
    case 'transform.rotateBy': return instance.transform.rotateBy(input!.targets as readonly PatchMapTarget[], input!.degrees as number, command.options as Parameters<typeof instance.transform.rotateBy>[2]);
    case 'transform.beginSession': { store(instance, command.id, instance.transform.beginSession(command.input as Parameters<typeof instance.transform.beginSession>[0])); return { opened: true }; }
    case 'transform.preview': return stored<PatchMapTransformSession>(instance, command.refs?.session).preview(command.input as Parameters<PatchMapTransformSession['preview']>[0]);
    case 'transform.edgePan': { const value = command.input as { pointerScreen: readonly [number, number]; deltaCss: readonly [number, number] }; return stored<PatchMapTransformSession>(instance, command.refs?.session).edgePan(value.pointerScreen, value.deltaCss); }
    case 'transform.commit': return stored<PatchMapTransformSession>(instance, command.refs?.session).commit();
    case 'transform.cancel': return stored<PatchMapTransformSession>(instance, command.refs?.session).cancel();
    default: throw new Error(`Unsupported shared operation ${command.op}`);
  }
}

export function assertCommandExpectation(command: SharedCommand, before: ReturnType<typeof observePublic>, after: ReturnType<typeof observePublic>, result: unknown): void {
  const expected = command.expect ?? {};
  if (expected.status !== undefined && (result as { status?: unknown } | null)?.status !== expected.status) {
    throw new Error(`${command.id}: expected status ${JSON.stringify(expected.status)}, received ${JSON.stringify(result)}`);
  }
  if (expected.throws !== undefined) {
    const wanted = expected.throws as { kind?: unknown };
    const thrown = (result as { thrown?: { kind?: unknown } } | null)?.thrown;
    if (!thrown || thrown.kind !== wanted.kind) throw new Error(`${command.id}: expected exception ${JSON.stringify(wanted)}, received ${JSON.stringify(result)}`);
  }
  const fields = { semanticHashUnchanged: 'semanticHash', snapshotUnchanged: 'dataset', historyUnchanged: 'history' } as const;
  for (const [assertion, field] of Object.entries(fields)) {
    if (expected[assertion] === true && JSON.stringify(before[field]) !== JSON.stringify(after[field])) {
      throw new Error(`${command.id}: ${assertion} failed`);
    }
  }
}

export async function runPublicFixture(fixture: SharedFixture, container: HTMLElement) {
  const fixtureAssets = await acquireSharedFixtureAssets(fixture);
  let instance: PatchMapInstance;
  try {
    instance = await PatchMap.mount({ container, data: fixture.dataset, ...fixture.surface, fit: false, ...(fixtureAssets.runtime ? { assetRuntime: fixtureAssets.runtime } : {}) });
  } catch (error) {
    await fixtureAssets.dispose();
    throw error;
  }
  const events: unknown[] = [];
  const disposers = [
    instance.history.onChange((state) => { events.push({ type: 'history', state }); }),
    instance.selection.onChange((ids) => { events.push({ type: 'selection', ids }); }),
  ];
  try {
    const initial = observePublic(instance);
    const steps = [];
    const failures: Array<{ commandId: string; message: string }> = [];
    for (const command of fixture.commands) {
      const before = observePublic(instance);
      const eventStart = events.length;
      let result: unknown;
      try {
        result = await executeSharedCommand(instance, command);
      } catch (error) {
        if (command.expect?.throws === undefined) failures.push({ commandId: command.id, message: `Unexpected exception: ${error instanceof Error ? error.message : String(error)}` });
        result = { thrown: { kind: error instanceof TypeError || error instanceof RangeError ? 'invalid-argument' : 'unexpected-error' } };
      }
      const after = observePublic(instance);
      try { assertCommandExpectation(command, before, after, result); } catch (error) { failures.push({ commandId: command.id, message: error instanceof Error ? error.message : String(error) }); }
      steps.push({ commandId: command.id, result, observation: after, events: events.slice(eventStart) });
    }
    return { fixtureId: fixture.id, initial, steps, failures };
  } finally {
    disposers.forEach((dispose) => { dispose(); });
    try { await instance.destroy(); } finally { await fixtureAssets.dispose(); }
  }
}
