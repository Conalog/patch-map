import { PatchMap } from '@conalog/patch-map';

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
  const patchMap = await PatchMap.mount({
    instanceId: 'patch-map-example-minimal',
    target: host,
    width: 320,
    height: 180,
    data: MINIMAL_DATASET,
  });
  const published = patchMap.debug.snapshot();
  await patchMap.destroy();
  return Object.freeze({
    example: 'minimal',
    rootIds: published.rootIds,
    backend: published.resources.renderer?.backend ?? null,
    canvasCountAfterDestroy: host.querySelectorAll('canvas').length,
  });
}
