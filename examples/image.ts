import { PatchMap, type PatchMapUpdateBatch } from '@conalog/patch-map/image';

/** Runs inside a browser, including a Chromium page owned by a server host. */
export async function renderMapImage(data: unknown, updates?: PatchMapUpdateBatch): Promise<Blob> {
  const map = await PatchMap.create({
    data,
    width: 1000,
    height: 1000,
    background: '#ffffff',
    fit: { padding: 40 },
  });
  try {
    if (updates !== undefined) {
      const result = map.updateBatch(updates);
      if (result.status === 'rejected' || result.status === 'refused') {
        throw new Error(result.diagnostic?.code ?? 'Map update failed');
      }
    }
    const image = await map.render({ format: 'jpeg', quality: 0.9 });
    return image.blob;
  } finally {
    await map.destroy();
  }
}
