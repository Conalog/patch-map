export const PACKED_VIEWPORT_BOUNDS_CONSUMER_SOURCE = `
async function verifyViewportBounds() {
  const host = document.createElement('div');
  document.body.append(host);
  const background = { type: 'background', id: 'bg', source: { type: 'rect', fill: '#ffffff' } };
  const boundsMap = await PatchMap.mount({
    container: host, instanceId: 'packed-viewport-bounds',
    width: 320, height: 1000, backend: 'webgl', resizeMode: 'manual', zoomLimits: [0.1, 8],
    data: [{
      type: 'item', id: 'overflow', size: { width: 100, height: 100 },
      components: [background, {
        type: 'bar', id: 'extra', source: { type: 'rect', fill: '#ff0000' },
        size: { width: 300, height: 20 }, placement: 'right',
      }],
    }, {
      type: 'grid', id: 'sparse', attrs: { angle: 45 }, cells: [[1, 0, 1], [0, 0, 1]],
      item: { size: 100, contentOrientation: 'follow-item', components: [background] },
    }, {
      type: 'grid', id: 'empty-grid', cells: [[0, 1]],
      item: { size: 100, components: [] },
    }],
  });
  try {
    for (const [id, expected, scale] of [
      ['overflow', [-200, 0, 300, 100], 288 / 300],
      ['sparse', [-100 * Math.SQRT2, 0, 250 * Math.SQRT2, 250 * Math.SQRT2], 288 / (250 * Math.SQRT2)],
      ['empty-grid', [100, 0, 0, 0], 8],
    ]) {
      boundsMap.viewport.restore({ centerWorld: [0, 0], scale: 2 });
      const focus = boundsMap.viewport.focus({ targets: { id } });
      const fit = boundsMap.viewport.fit({ targets: { id }, padding: [16, 16] });
      const close = (actual, wanted) => Math.abs(actual - wanted) < 1e-7;
      if (!focus.worldBounds || !fit.worldBounds
        || !expected.every((value, index) => close(focus.worldBounds[index], value) && close(fit.worldBounds[index], value))
        || focus.viewport.scale !== 2
        || !close(focus.viewport.centerWorld[0], expected[0] + expected[2] / 2)
        || !close(focus.viewport.centerWorld[1], expected[1] + expected[3] / 2)
        || !close(fit.viewport.scale, scale)) {
        throw new Error('packed focus/fit container bounds failed: ' + id);
      }
    }
    const capture = await boundsMap.capture.png();
    if (!capture.dataUrl.startsWith('data:image/png')) throw new Error('bounds map capture failed');
  } finally {
    await boundsMap.destroy();
    host.remove();
  }
}
`;
