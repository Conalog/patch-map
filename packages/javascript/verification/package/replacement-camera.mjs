export const PACKED_REPLACEMENT_CAMERA_HTML_SOURCE = `<!doctype html>
<html><body style="margin:0"><div id="camera-host" style="width:640px;height:480px"></div>
<script type="module" src="/replacement-camera.js"></script></body></html>`;

export const PACKED_REPLACEMENT_CAMERA_SOURCE = `
import { PatchMap } from '@conalog/patch-map';
const data = [
  { id: 'blue', type: 'rect', show: true, attrs: { x: 24, y: 20 }, size: { width: 160, height: 80 }, fill: '#2563eb' },
  { id: 'green', type: 'rect', show: true, attrs: { x: 220, y: 160 }, size: { width: 120, height: 70 }, fill: '#16a34a' },
];
const other = structuredClone(data);
other[1].attrs.x += 40;
other[1].attrs.y += 30;
let map;
window.__REPLACEMENT_CAMERA__ = {
  async mount(angle, preserve) {
    if (map) await map.destroy();
    map = await PatchMap.mount({ container: '#camera-host', data, fit: true,
      width: 640, height: 480, pixelRatio: 1, resizeMode: 'manual', backend: 'webgl' });
    map.rotation.set(angle);
    map.viewport.fit();
    if (preserve) {
      map.viewport.panBy([15, -10]);
      map.viewport.zoomBy(1.1);
    }
    return this.state();
  },
  async replace(mode, preserve, variant) {
    const input = structuredClone(variant === 'B' ? other : data);
    const options = { strict: true, ...(preserve ? { fit: false } : {}) };
    if (mode === 'async') await map.data.replaceAsync(input, options);
    else map.data.replace(input, options);
    return this.state();
  },
  state() {
    return { viewport: map.viewport.snapshot(), rotation: map.rotation.value,
      viewRevision: map.debug.snapshot().revisions.viewRevision };
  },
  async ready() {
    map.selection.clear();
    await map.capture.png();
  },
  point(id, variant) {
    const record = (variant === 'B' ? other : data).find(record => record.id === id);
    const view = map.viewport.snapshot();
    const x = (record.attrs.x + record.size.width / 2 - view.centerWorld[0]) * view.scale;
    const y = (record.attrs.y + record.size.height / 2 - view.centerWorld[1]) * view.scale;
    const angle = map.rotation.value * Math.PI / 180;
    const bounds = document.querySelector('#camera-host canvas').getBoundingClientRect();
    return { x: bounds.left + 320 + x * Math.cos(angle) - y * Math.sin(angle),
      y: bounds.top + 240 + x * Math.sin(angle) + y * Math.cos(angle) };
  },
  selection() { return map.selection.ids; },
  noops() { return { fit: map.viewport.fit(), reset: map.viewport.reset() }; },
  async reject(mode) {
    const input = structuredClone(data);
    input[0].attrs.x = NaN;
    try {
      if (mode === 'async') await map.data.replaceAsync(input, { strict: true });
      else map.data.replace(input, { strict: true });
    } catch { return true; }
    return false;
  },
  async destroy() { await map.destroy(); },
};
`;

/** Actual canvas pixels and native pointer events against the installed tarball. */
export async function verifyPackedReplacementCamera(page, baseUrl) {
  await page.goto(new URL('replacement-camera.html', baseUrl).href);
  await page.waitForFunction(() => window.__REPLACEMENT_CAMERA__ !== undefined);
  const cases = [];
  const call = (method, ...args) => page.evaluate(
    ({ method, args }) => window.__REPLACEMENT_CAMERA__[method](...args),
    { method, args },
  );
  const pixels = async () => {
    await page.mouse.move(780, 580);
    await call('ready');
    return page.locator('#camera-host canvas').screenshot();
  };
  const assertEqual = (actual, expected, label) => {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(label);
  };
  let clicks = 0;
  for (const mode of ['sync', 'async']) {
    for (const preserve of [false, true]) {
      for (const angle of [0, 37]) {
        const name = mode + '/fit:' + !preserve + '/rotation:' + angle;
        const initial = await call('mount', angle, preserve);
        const baseline = await pixels();
        for (const variant of ['A', 'A', 'B', 'A']) {
          const state = await call('replace', mode, preserve, variant);
          if (preserve || variant === 'A') {
            assertEqual(state.viewport, initial.viewport, name + ': camera changed');
          }
          assertEqual(state.rotation, angle, name + ': rotation changed');
          const rendered = await pixels();
          if (variant === 'A' && !rendered.equals(baseline)) {
            throw new Error(name + ': rendered camera diverged from baseline');
          }
          for (const id of ['blue', 'green']) {
            const point = await call('point', id, variant);
            await page.mouse.click(point.x, point.y);
            assertEqual(await call('selection'), [id], name + ': pointer selected wrong panel');
            clicks += 1;
          }
        }
        if (!preserve) {
          const before = await call('state');
          const noops = await call('noops');
          if (noops.fit.changed || noops.reset.changed) throw new Error(name + ': fit/reset not equivalent');
          assertEqual(await call('state'), before, name + ': equivalent command published a view');
          if (!(await pixels()).equals(baseline)) throw new Error(name + ': no-op changed rendering');
        }
        const beforeFailure = await call('state');
        if (!await call('reject', mode)) throw new Error(name + ': invalid replacement accepted');
        assertEqual(await call('state'), beforeFailure, name + ': rejected load changed camera');
        if (!(await pixels()).equals(baseline)) throw new Error(name + ': rejected load changed rendering');
        cases.push(name);
      }
    }
  }
  await call('destroy');
  return { cases, clicks, renderedCamera: true, pointerSelection: true, atomicRejection: true };
}
