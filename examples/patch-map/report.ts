import { PatchMap } from '@conalog/patch-map';

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
  const patchMap = await PatchMap.mount({
    instanceId: 'patch-map-example-report',
    target: host,
    width: 420,
    height: 240,
    background: '#f8fafc',
    data: REPORT_DATASET,
  });
  const extraction = await patchMap.capture.png();
  await patchMap.destroy();
  return Object.freeze({
    example: 'report',
    mime: extraction.mime,
    dataUrlPrefix: extraction.dataUrl.slice(0, 22),
    authoritativeCanvasRetained: true,
    canvasCountAfterDestroy: host.querySelectorAll('canvas').length,
  });
}
