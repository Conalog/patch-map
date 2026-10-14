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
    }, {
      type: 'grid', id: 'no-cells', attrs: { x: 500, y: 200 }, cells: [[0]],
      item: { size: 100, components: [background] },
    }, {
      type: 'group', id: 'empty-group', attrs: { x: 400, y: 200 }, children: [],
    }, {
      type: 'relations', id: 'empty-links', attrs: { x: 600, y: 200 }, links: [],
    }, {
      type: 'rect', id: 'stroked-rect', attrs: { x: 800 }, size: { width: 100, height: 40 },
      fill: '#ffffff', stroke: { color: '#000000', width: 12 },
    }, {
      type: 'rect', id: 'zero-rect', attrs: { x: 900 }, size: { width: 100, height: 0 },
    }, {
      type: 'item', id: 'bordered-item', attrs: { x: 1000 }, size: 100,
      components: [{ ...background, source: { ...background.source, borderWidth: 8 } }],
    }, {
      type: 'item', id: 'link-a', attrs: { x: 1200 }, size: 100, components: [background],
    }, {
      type: 'item', id: 'link-b', attrs: { x: 1400, y: 100 }, size: 100, components: [background],
    }, {
      type: 'group', id: 'relation-group', children: [{
        type: 'relations', id: 'drawn-relation', style: { width: 8 },
        links: [{ source: 'link-a', target: 'link-b' }],
      }],
    }, {
      type: 'group', id: 'self-relation-group', children: [{
        type: 'relations', id: 'self-relation', style: { width: 8 },
        links: [{ source: 'link-a', target: 'link-a' }],
      }],
    }, {
      type: 'rect', id: 'chain-a', attrs: { x: 1995, y: -5 }, size: 10, fill: '#ffffff',
    }, {
      type: 'rect', id: 'chain-b', attrs: { x: 2095, y: -5 }, size: 10, fill: '#ffffff',
    }, {
      type: 'rect', id: 'chain-c', attrs: { x: 1995, y: 5 }, size: 10, fill: '#ffffff',
    }, {
      type: 'rect', id: 'distant-a', attrs: { x: 2995, y: 995 }, size: 10, fill: '#ffffff',
    }, {
      type: 'rect', id: 'distant-b', attrs: { x: 3095, y: 995 }, size: 10, fill: '#ffffff',
    }, {
      type: 'group', id: 'chain-group', children: [{
        type: 'relations', id: 'chain', style: { width: 8 },
        links: [{ source: 'chain-a', target: 'chain-b' }, { source: 'chain-b', target: 'chain-c' }],
      }],
    }, {
      type: 'group', id: 'mixed-chain-group', children: [{
        type: 'relations', id: 'mixed-chain', style: { width: 8 },
        links: [{ source: 'chain-a', target: 'chain-b' }, { source: 'chain-b', target: 'chain-c' }, { source: 'distant-a', target: 'distant-b' }],
      }],
    }, {
      type: 'rect', id: 'coincident-a', attrs: { x: 3995, y: 495 }, size: 10, fill: '#ffffff',
    }, {
      type: 'rect', id: 'coincident-b', attrs: { x: 3995, y: 495 }, size: 10, fill: '#ffffff',
    }, {
      type: 'group', id: 'degenerate-relation-group', attrs: { x: 4200, y: 100 }, children: [{
        type: 'relations', id: 'degenerate-relation', style: { width: 8 },
        links: [{ source: 'coincident-a', target: 'coincident-b' }],
      }],
    }, {
      type: 'image', id: 'intrinsic-image', attrs: { x: 1600 },
      source: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="32"><rect width="64" height="32" fill="red"/></svg>'),
    }],
  });
  try {
    for (const [id, expected, scale] of [
      ['overflow', [-200, 0, 300, 100], 288 / 300],
      ['sparse', [-100 * Math.SQRT2, 0, 250 * Math.SQRT2, 250 * Math.SQRT2], 288 / (250 * Math.SQRT2)],
      ['empty-grid', [100, 0, 0, 0], 8],
      ['no-cells', [500, 200, 0, 0], 8],
      ['empty-group', [400, 200, 0, 0], 8],
      ['empty-links', [600, 200, 0, 0], 8],
      ['stroked-rect', [794, -6, 112, 52], 288 / 112],
      ['zero-rect', [900, 0, 0, 0], 8],
      ['bordered-item', [996, -4, 108, 108], 288 / 108],
      ['relation-group', [1246, 46, 208, 108], 288 / 208],
      ['self-relation-group', [1250 - 4 * Math.SQRT2, -50 - 4 * Math.SQRT2, 150 + 8 * Math.SQRT2, 200 + 8 * Math.SQRT2], 288 / (150 + 8 * Math.SQRT2)],
      ['chain-group', [1960, -40, 180, 90], 1.6],
      ['mixed-chain-group', [1960, -40, 1180, 1080], 288 / 1180],
      ['degenerate-relation-group', [4200, 100, 0, 0], 8],
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
    const intrinsic = boundsMap.viewport.focus({ targets: { id: 'intrinsic-image' } });
    if (!intrinsic.worldBounds || ![1600, 0, 64, 32].every((value, index) => Math.abs(intrinsic.worldBounds[index] - value) < 1e-7)) {
      throw new Error('decoded intrinsic image viewport bounds stale');
    }
  } finally {
    await boundsMap.destroy();
    host.remove();
  }
}
`;
