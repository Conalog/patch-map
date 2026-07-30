import { PatchMapHostAdapter } from './host-adapter';

const MINIMAL_DATASET = Object.freeze([
  Object.freeze({
    type: 'rect',
    id: 'minimal-card',
    show: true,
    attrs: Object.freeze({ x: 24, y: 20 }),
    size: Object.freeze({ width: 160, height: 80 }),
    fill: '#2563eb',
  }),
]);

export async function runMinimalExample(host: HTMLElement): Promise<Readonly<{
  readonly example: 'minimal';
  readonly rootIds: readonly string[];
  readonly backend: string | null;
  readonly canvasCountAfterDestroy: number;
}>> {
  const adapter = await PatchMapHostAdapter.mount({
    initialize: {
      instanceId: 'patch-map-example-minimal',
      target: host,
      width: 320,
      height: 180,
      preference: 'webgl',
      strategy: 'mesh',
    },
  });
  adapter.load(MINIMAL_DATASET, { datasetRef: 'example:minimal' });
  const published = adapter.publish(0);
  await adapter.destroy();
  return Object.freeze({
    example: 'minimal',
    rootIds: published.rootIds,
    backend: published.resources.renderer?.backend ?? null,
    canvasCountAfterDestroy: host.querySelectorAll('canvas').length,
  });
}
