import { PatchMapHostAdapter } from './host-adapter';

const REPORT_DATASET = Object.freeze([
  Object.freeze({
    type: 'rect',
    id: 'report-panel',
    show: true,
    attrs: Object.freeze({ x: 16, y: 16 }),
    size: Object.freeze({ width: 220, height: 120 }),
    fill: '#0f766e',
  }),
  Object.freeze({
    type: 'text',
    id: 'report-title',
    show: true,
    attrs: Object.freeze({ x: 36, y: 46 }),
    text: 'PatchMap report',
    style: Object.freeze({ fontSize: 18, fill: '#ffffff' }),
  }),
]);

export async function runReportExample(host: HTMLElement): Promise<Readonly<{
  readonly example: 'report';
  readonly mime: string;
  readonly dataUrlPrefix: string;
  readonly authoritativeCanvasRetained: boolean;
  readonly canvasCountAfterDestroy: number;
}>> {
  const adapter = await PatchMapHostAdapter.mount({
    initialize: {
      instanceId: 'patch-map-example-report',
      target: host,
      width: 420,
      height: 240,
      preference: 'webgl',
      strategy: 'mesh',
      background: '#f8fafc',
    },
  });
  adapter.load(REPORT_DATASET, { datasetRef: 'example:report' });
  const extraction = await adapter.extract();
  await adapter.destroy();
  return Object.freeze({
    example: 'report',
    mime: extraction.mime,
    dataUrlPrefix: extraction.dataUrl.slice(0, 22),
    authoritativeCanvasRetained: extraction.authoritativeCanvasRetained,
    canvasCountAfterDestroy: host.querySelectorAll('canvas').length,
  });
}
