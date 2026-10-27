// Read-only consumer capture. Run with Bun (the WebView's module resolver):
// bun tool/capture_mobile_replay.mjs /absolute/path/to/patch-webview
// Writes only this example's fixture; never mutates the consumer checkout.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = resolve(process.argv[2]);
const owner = 'src/lib/features/map/infra/patchmap/';
const load = (name) => import(pathToFileURL(resolve(root, owner, name)).href);
const { theme, assets } = await load('constants.js');
const { buildPanelComponents } = await load('metricsTemplates.js');
const { buildInverterFrameUpdatePayload } = await load('inverterFrameComponents.js');
const { buildRouterLayoutComponents } = await load('routerRenderer.js');
const { EDGE_LAYOUT } = await load('edgeRenderer.js');
const states = ['loading', 'noData', 'noSignal', 'noDevice', 'outOfRange', 'error', 'dataChart', 'dataText'];
const panels = Object.fromEntries(states.map((state) => [state, buildPanelComponents({
  view: state === 'dataText' ? 'number' : 'chart',
  panel: { state, text: '123.4', tint: '#0C73BF', barFillPercent: 37, barAnimation: true },
})]));
panels.dataTextLight = buildPanelComponents({ view: 'number', panel: {
  state: 'dataText', text: '98.7', tint: '#D4D4D4',
} });
const inverterInputs = {
  pending: { name: 'INV1', visualState: { tint: '#D4D4D4', iconSource: 'pencil', stepSource: 'step-0', showProgress: true } },
  registered: { name: 'INV1', visualState: { tint: '#2ECC71', iconSource: 'none', stepSource: 'none', assetIdText: 'A00000000001', slaveIdText: '1' } },
  monitoring: { name: 'INV1', statusHeightPercent: 40, visualState: { tint: '#0C73BF', iconSource: 'none', stepSource: 'none', indicatorText: '10\n20' } },
  failed: { name: 'INV1', visualState: { tint: '#94A9BA', iconSource: 'wifi', stepSource: 'none', showWifi: true } },
};
const inverters = Object.fromEntries(Object.entries(inverterInputs).map(([key, input]) => [key, buildInverterFrameUpdatePayload(input).changes]));
const routerBase = { components: [
  { type: 'background', source: { type: 'rect', fill: 'white', borderWidth: 2, radius: 6 } },
  { type: 'icon', source: 'wifi', size: 24 },
] };
const routers = Object.fromEntries(['#2ECC71', '#F78E89'].map((tint, i) => [i === 0 ? 'online' : 'failed', buildRouterLayoutComponents(routerBase, { show: true, tint }, 'monitoring')]));
const symbols = Object.fromEntries(assets.map(({ alias, src, data }) => [alias, {
  src: `data:image/svg+xml;base64,${readFileSync(resolve(root, 'static', src.slice(1))).toString('base64')}`, data,
}]));
const files = ['constants.js', 'metricsTemplates.js', 'inverterFrameComponents.js', 'routerRenderer.js', 'edgeRenderer.js', 'objectVisibility.js', 'textStyle.js', 'renderLayers.js'].map((f) => owner + f);
files.push(...assets.map(({ src }) => `static${src}`));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const fixture = {
  provenance: {
    kind: 'Executed consumer builders and actual SVG bytes; modeled layout/IDs/timing, not a production API capture',
    webviewHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    installedMapVersion: JSON.parse(readFileSync(resolve(root, 'node_modules/@conalog/patch-map/package.json'), 'utf8')).version,
    installedMapBundleSha256: sha256(readFileSync(resolve(root, 'node_modules/@conalog/patch-map/dist/index.esm.js'))),
    sources: Object.fromEntries(files.map((f) => [f, sha256(readFileSync(resolve(root, f)))])),
    panelInput: { states, text: '123.4', tint: '#0C73BF', barFillPercent: 37 },
    inverterInputs,
  },
  theme, symbols, panels, inverters, routers, edgeLayout: EDGE_LAYOUT,
};
const output = fileURLToPath(new URL('../assets/mobile_replay.json', import.meta.url));
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(fixture, null, 2)}\n`);
console.log(`Captured ${states.length} panel states, ${Object.keys(inverters).length} inverter states and ${assets.length} SVG aliases`);
