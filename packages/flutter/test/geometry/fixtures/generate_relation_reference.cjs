// Run from repository root with Node 22. PATCH_MAP_ESBUILD may point to an
// installed esbuild module when root workspace dependencies are not installed.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const esbuild = require(process.env.PATCH_MAP_ESBUILD || 'esbuild');
const source = 'packages/javascript/src/geometry/relation-paths.ts';
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'patchmap-relations-'));
try {
  const outfile = path.join(temporary, 'reference.cjs');
  esbuild.buildSync({entryPoints: [source], bundle: true, platform: 'node', format: 'cjs', outfile});
  const {resolvePatchMapRelationPath} = require(outfile);
  const endpoints = [
    {id: 'a', center: [5, 5], worldBounds: [0, 0, 10, 10], visible: true},
    {id: 'b', center: [105, 5], worldBounds: [100, 0, 10, 10], visible: true},
  ];
  const cases = [
    ['straight', [1, 0, 0, 1, 0, 0], 0, 1, 2],
    ['transformed', [2, 0, 0, 3, 7, -5], 0, 1, 4],
    ['self', [1, 0, 0, 1, 0, 0], 0, 0, 2],
  ].map(([name, affine, f, t, width]) => ({
    name, affine, width, source: endpoints[f], target: endpoints[t],
    result: resolvePatchMapRelationPath({entityId: name, relationId: 'r', key: 'a>b',
      sourceId: endpoints[f].id, targetId: endpoints[t].id, affine},
      endpoints[f], endpoints[t], {color: 0xff0000ff, width, opacity: 1, zIndex: 0, visible: true}),
  }));
  fs.writeFileSync(process.argv[2] || 'packages/flutter/test/geometry/fixtures/relation_reference.json',
    JSON.stringify({source, sha256: crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex'), cases}, null, 2) + '\n');
} finally {
  fs.rmSync(temporary, {recursive: true});
}
