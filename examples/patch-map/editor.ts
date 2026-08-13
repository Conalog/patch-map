import { PatchMap } from '@conalog/patch-map';

const EDITOR_DATASET = Object.freeze([
  Object.freeze({
    type: 'rect',
    id: 'editor-card',
    show: true,
    attrs: Object.freeze({ x: 30, y: 40 }),
    size: Object.freeze({ width: 100, height: 64 }),
    fill: '#7c3aed',
  }),
]);

export async function runEditorExample(host: HTMLElement): Promise<Readonly<{
  readonly example: 'editor';
  readonly selectedIds: readonly string[];
  readonly transformStatus: string;
  readonly undoStatus: string;
  readonly selectionPublicationCount: number;
  readonly disposedSelectionHosts: number;
  readonly canvasCountAfterDestroy: number;
}>> {
  const patchMap = await PatchMap.mount({
    instanceId: 'patch-map-example-editor',
    container: host,
    width: 360,
    height: 220,
    data: EDITOR_DATASET,
    selection: {
      visual: { color: '#ef4444', strokeWidth: 3, displayMode: 'element-only' },
      box: {
        activationModifier: 'shift',
        visual: { color: '#1099ff', strokeWidth: 1, fillAlpha: 0.08 },
      },
    },
  });
  const publications: string[][] = [];
  const releaseSelection = patchMap.selection.onChange((ids) => {
    publications.push([...ids]);
  });
  const selection = patchMap.selection.set('editor-card');
  const transform = patchMap.transform.moveBy(
    { id: 'editor-card' },
    [12, 8],
    { actionId: 'editor-move', recordHistory: true },
  );
  const undo = patchMap.history.undo();
  releaseSelection();
  const disposedSelectionHosts = 1;
  await patchMap.destroy();
  return Object.freeze({
    example: 'editor',
    selectedIds: selection,
    transformStatus: transform.status,
    undoStatus: undo.status,
    selectionPublicationCount: publications.length,
    disposedSelectionHosts,
    canvasCountAfterDestroy: host.querySelectorAll('canvas').length,
  });
}
