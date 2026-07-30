import { PatchMapHostAdapter } from './host-adapter';

const DASHBOARD_DATASET = Object.freeze([
  Object.freeze({
    type: 'item',
    id: 'dashboard-metric',
    show: true,
    attrs: Object.freeze({ x: 20, y: 20 }),
    size: Object.freeze({ width: 120, height: 140 }),
    components: Object.freeze([
      Object.freeze({
        type: 'background',
        id: 'background',
        source: Object.freeze({ type: 'rect', fill: '#eff6ff', radius: 8 }),
      }),
      Object.freeze({
        type: 'bar',
        id: 'bar',
        source: Object.freeze({ type: 'rect', fill: '#2563eb' }),
        size: Object.freeze({ width: 72, height: 48 }),
        placement: 'bottom',
        animation: true,
      }),
      Object.freeze({
        type: 'text',
        id: 'label',
        text: '48',
        placement: 'top',
        style: Object.freeze({ fontSize: 14, fill: '#0f172a' }),
      }),
    ]),
  }),
]);

export async function runDashboardExample(host: HTMLElement): Promise<Readonly<{
  readonly example: 'dashboard';
  readonly updateStatus: string;
  readonly barHeight: unknown;
  readonly canvasCountAfterDestroy: number;
}>> {
  const adapter = await PatchMapHostAdapter.mount({
    initialize: {
      instanceId: 'patch-map-example-dashboard',
      target: host,
      width: 320,
      height: 200,
      preference: 'webgl',
      strategy: 'mesh',
      background: '#f8fafc',
    },
  });
  adapter.load(DASHBOARD_DATASET, { datasetRef: 'example:dashboard' });
  const update = adapter.bulkUpdate({
    strict: true,
    actionId: 'dashboard-refresh',
    targets: [{ kind: 'component', ownerId: 'dashboard-metric', id: 'bar' }],
    changes: [{ path: ['size', 'height'], value: 72 }],
  });
  adapter.publish(16);
  const bar = adapter.lookup('bar');
  await adapter.destroy();
  return Object.freeze({
    example: 'dashboard',
    updateStatus: update.status,
    barHeight: (bar?.value.size as Readonly<{ height?: unknown }> | undefined)?.height ?? null,
    canvasCountAfterDestroy: host.querySelectorAll('canvas').length,
  });
}
