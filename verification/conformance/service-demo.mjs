import { readFile, writeFile } from 'node:fs/promises';

// Scene authority: service-derived panel schema. Coordinates and readings are
// deterministic demo data, not a copy of a customer's plant or live telemetry.
const panel = JSON.parse(await readFile('conformance/scenes/panel-groups.json', 'utf8'));
const data = [];
const clone = value => structuredClone(value);
const device = (id, display, x, y) => ({
  type: 'item', id, label: id.toUpperCase(), size: 40,
  attrs: { x, y, angle: 0, display },
  components: [
    { id: 'background', type: 'background', source: { type: 'rect', fill: 'white', borderWidth: 2, borderColor: 'primary.default', radius: 6 } },
    { id: 'icon', type: 'icon', source: display, size: 32, tint: 'primary.default', placement: 'center' },
    { id: 'bar', type: 'bar', show: false, size: '100%', source: { type: 'rect', radius: 3, fill: 'white' }, tint: 'primary.default', animation: false },
  ],
});
for (let g = 0; g < panel.groups; g++) {
  const x = g % 5 * 980, y = Math.floor(g / 5) * 580;
  const grid = clone(panel.grid);
  Object.assign(grid, { id: `g${g}`, label: `PG-${String(g + 1).padStart(2, '0')}`, cells: Array.from({ length: panel.rows }, () => Array(panel.columns).fill(1)) });
  Object.assign(grid.attrs, { x, y });
  // Each group remains the real 5 × 20 service template, including hidden icon/text.
  data.push(grid,
    { type: 'text', id: g === 0 ? 'text' : `label-${g}`, text: `${grid.label} · 100 panels`, attrs: { x, y: y - 48, display: 'text' }, style: { fontSize: 32, fill: '#173d60' }, size: { width: 870, height: 40 } },
    device(`combiner-${g}`, 'combiner', x + 350, y + 440),
    device(`inverter-${g}`, 'inverter', x + 480, y + 440),
    { type: 'relations', id: `string-${g}`, attrs: { display: 'string' }, links: [{ source: `combiner-${g}`, target: `inverter-${g}` }], style: { color: '#0c73bf', width: 2 } },
  );
}
data.push({type:'rect', id:'work-zone', label:'작업 구역', attrs:{x:900,y:440,display:'rect'}, size:100, fill:'#D9D9D9'});
const cloudAlert = await readFile('conformance/assets/service/cloud-alert.svg');
const fixture = {
  schemaRevision: 'patch-map-conformance/1', id: 'service-blueprint',
  description: 'Service-derived synthetic blueprint: 50 panelGroups × 5 rows × 20 columns, combiner/inverter items and string links.',
  provenance: {
    ...panel.provenance,
    revision: 'e6e3e00937bc5dad9b95ea1a0d01b18a1f74cd17',
    sources: [...panel.provenance.sources, 'src/lib/editor/plantmap/toolbar-item-tool.js', 'src/lib/editor/plantmap/toolbar-text-tool.js', 'src/lib/features/plantmap/item-icon-sources.js', 'src/lib/editor/plantmap/toolbar-rect-tool.js', 'src/lib/features/plantmap/patchmap-assets.js', 'static/icons/cloud-alert.svg'],
    adaptations: 'Synthetic coordinates, PG labels and deterministic readings. Stable component IDs for v1. Service item HTTP icon descriptors use packaged same-purpose inverter/combiner SVG aliases for offline reproduction. String link placement is illustrative; no customer plant IDs or telemetry.'
  },
  surface: { width: 480, height: 520, pixelRatio: 1, background: '#f8fafc' },
  theme: { ...panel.theme, gray: { light: '#9eb3c3', dark: '#445b6e' } },
  assets: [{alias:'cloudAlert',kind:'image',descriptor:{src:`data:image/svg+xml;base64,${cloudAlert.toString('base64')}`,data:{resolution:3}}}],
  requiredAssets: ['cloudAlert'],
  displayModes: {
    error: { bar: { changes: { show: false } }, text: { changes: { show: false } }, icon: { changes: { show: true, source: 'cloudAlert', tint: 'black' } } },
    bar: { bar: { height: 37, changes: { show: true, tint: 'primary.default' } }, text: { changes: { show: false } }, icon: { changes: { show: false } } },
    text: { bar: { height: 74, changes: { show: true, tint: 'primary.default' } }, text: { componentId: 'text', text: '350', changes: { show: true } }, icon: { changes: { show: false } } },
    noData: { bar: { height: 74, changes: { show: true, tint: 'gray.dark' } }, text: { changes: { show: false } }, icon: { changes: { show: true, source: 'warning', tint: 'white' } } },
    wifi: { bar: { height: 74, changes: { show: true, tint: 'gray.light' } }, text: { changes: { show: false } }, icon: { changes: { show: true, source: 'wifi', tint: 'white' } } },
  },
  dataset: data, commands: [],
};
await writeFile('conformance/scenes/service-blueprint.json', `${JSON.stringify(fixture, null, 2)}\n`);
console.log('Generated service blueprint: 50 × 5 × 20 panels + devices/labels/string links');
