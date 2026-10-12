import {
  PatchMap,
  type PatchMapInstance,
  type PatchMapOptions,
  type PatchMapRenderOptions,
  type PatchMapRenderResult,
  type PatchMapUpdateBatch,
  type PatchMapUpdateResult,
} from '@conalog/patch-map/image';

export interface ImageJob {
  readonly create: PatchMapOptions;
  readonly updates?: PatchMapUpdateBatch;
  readonly output?: PatchMapRenderOptions;
}

export interface ImageVariant {
  readonly name: string;
  /** Supply every field that varies between outputs, including reset values. */
  readonly updates: PatchMapUpdateBatch;
  readonly output?: PatchMapRenderOptions;
}

export class ImageUpdateError extends Error {
  constructor(readonly result: PatchMapUpdateResult) {
    super(result.diagnostic?.code ?? (result.missing.length > 0 ? 'Image update targets missing' : 'Map update failed'));
    this.name = 'ImageUpdateError';
  }
}

function applyUpdates(map: PatchMapInstance, updates: PatchMapUpdateBatch): void {
  const result = map.updateBatch(updates);
  if (result.status === 'rejected' || result.status === 'refused' || result.missing.length > 0) {
    throw new ImageUpdateError(result);
  }
}

/** Browser only. Final business values belong in create.data whenever possible. */
export async function renderMapImage(job: ImageJob): Promise<PatchMapRenderResult> {
  const map = await PatchMap.create(job.create);
  try {
    if (job.updates !== undefined) applyUpdates(map, job.updates);
    return await map.render(job.output);
  } finally {
    await map.destroy();
  }
}

/** One fixed-size map per related group; consume each Blob before rendering again. */
export async function renderMapVariants(
  create: PatchMapOptions,
  variants: Iterable<ImageVariant>,
  consume: (name: string, image: PatchMapRenderResult) => void | Promise<void>,
): Promise<void> {
  const map = await PatchMap.create(create);
  try {
    for (const variant of variants) {
      applyUpdates(map, variant.updates);
      await consume(variant.name, await map.render(variant.output));
    }
  } finally {
    // Also runs when updates, encoding, or the host consumer fails.
    await map.destroy();
  }
}

export interface PanelReading {
  readonly id: string;
  readonly color: string;
  readonly label: string;
}

/** Example business adapter: final color, full-height bar and label in authored data. */
export function buildPanelData(readings: readonly PanelReading[]) {
  return readings.map((reading, index) => ({
    type: 'item', id: reading.id, show: true,
    attrs: { x: 20 + index * 100, y: 20 },
    size: { width: 80, height: 120 },
    components: [
      { type: 'background', id: 'background', source: { type: 'rect', fill: '#eeeeee' } },
      {
        type: 'bar', id: 'bar', source: { type: 'rect', fill: reading.color },
        size: { width: '100%', height: '100%' }, placement: 'bottom',
      },
      {
        type: 'text', id: 'label', text: reading.label, placement: 'top',
        style: { fontFamily: 'FiraCode', fontSize: 14, fill: '#000000' },
      },
    ],
  }));
}

/** All varying fields are supplied for every target; no previous color/text leaks. */
export function buildPanelBatch(readings: readonly PanelReading[]): PatchMapUpdateBatch {
  return {
    targets: readings.map(({ id }) => id),
    bar: { changes: { source: readings.map(({ color }) => ({ type: 'rect', fill: color })) } },
    text: { text: readings.map(({ label }) => label) },
  };
}

/** A complete browser call site. Replace readings/consume with business input/output. */
export async function runImageExample(
  consume: (name: string, image: PatchMapRenderResult) => void | Promise<void>,
): Promise<void> {
  const normal: readonly PanelReading[] = [
    { id: 'panel-a', color: '#22c55e', label: 'NORMAL' },
    { id: 'panel-b', color: '#22c55e', label: 'NORMAL' },
  ];
  const warning: readonly PanelReading[] = [
    { id: 'panel-a', color: '#ff0000', label: 'WARN' },
    { id: 'panel-b', color: '#22c55e', label: 'NORMAL' },
  ];
  const create: PatchMapOptions = {
    data: buildPanelData(normal), width: 320, height: 180,
    background: '#ffffff', fit: { padding: 20 },
  };
  // One image: values are already final; no updateBatch is needed.
  await consume('single', await renderMapImage({ create, output: { format: 'jpeg', quality: 0.9 } }));
  // Same geometry: change every variable field, then restore explicit normal values.
  await renderMapVariants(create, [
    { name: 'warning', updates: buildPanelBatch(warning), output: { format: 'png' } },
    { name: 'restored', updates: buildPanelBatch(normal), output: { format: 'png' } },
  ], consume);
}

/** Fully defined local browser consumer; revoke the URL after the image loads. */
export async function previewImage(name: string, image: PatchMapRenderResult): Promise<void> {
  const url = URL.createObjectURL(image.blob);
  const element = new Image();
  element.alt = name;
  element.width = image.size[0];
  element.height = image.size[1];
  try {
    element.src = url;
    await element.decode();
    document.body.appendChild(element);
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Browser entry: await runImageExample(previewImage);
