import { PatchMapHostAdapter } from './host-adapter';

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
  const adapter = await PatchMapHostAdapter.mount({
    initialize: {
      instanceId: 'patch-map-example-editor',
      target: host,
      width: 360,
      height: 220,
      preference: 'webgl',
      strategy: 'mesh',
    },
  });
  adapter.load(EDITOR_DATASET, { datasetRef: 'example:editor' });
  const publications: string[][] = [];
  adapter.observeSelection((publication) => {
    publications.push([...publication.selectedIds]);
  });
  const selection = adapter.selection(['editor-card']);
  const transform = adapter.transform(
    {
      kind: 'move',
      selectionIds: ['editor-card'],
      deltaWorld: [12, 8],
    },
    { actionId: 'editor-move', recordHistory: true },
  );
  const undo = adapter.history('undo');
  adapter.publish(16);
  const disposedSelectionHosts = adapter.dispose();
  await adapter.destroy();
  return Object.freeze({
    example: 'editor',
    selectedIds: selection.current,
    transformStatus: transform.status,
    undoStatus: undo.status,
    selectionPublicationCount: publications.length,
    disposedSelectionHosts,
    canvasCountAfterDestroy: host.querySelectorAll('canvas').length,
  });
}
