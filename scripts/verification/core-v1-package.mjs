import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const packageSpecifier = process.env.CORE_V1_SPECIFIER ?? '@conalog/patch-map/core-v1';
const expectedExports = [
  'Canvas2DRenderer',
  'CoreDestroyedError',
  'CoreError',
  'CoreScene',
  'CoreTargetError',
  'CoreValidationError',
  'NoopRenderer',
  'createCoreScene',
].sort();
const temporaryRoot = await mkdtemp(join(tmpdir(), 'patch-map-core-v1-consumer-'));
const packDirectory = join(temporaryRoot, 'pack');
const consumerDirectory = join(temporaryRoot, 'consumer');
const keepTemporary = process.env.CORE_V1_KEEP_TEMP === '1';

const assertFile = async (path, label) => {
  const details = await stat(path);
  assert.equal(details.isFile(), true, `${label} is not a file: ${path}`);
};

const packageTargets = (manifest) => {
  const rootExport = manifest.exports?.['.'];
  const coreExport = manifest.exports?.['./core-v1'];
  assert(rootExport && typeof rootExport === 'object', 'Package is missing exports["."]');
  assert(coreExport && typeof coreExport === 'object', 'Package is missing exports["./core-v1"]');

  for (const [label, value] of [
    ['main', manifest.main],
    ['module', manifest.module],
    ['types', manifest.types],
    ['unpkg', manifest.unpkg],
    ['exports["."].types', rootExport.types],
    ['exports["."].import', rootExport.import],
    ['exports["."].require', rootExport.require],
    ['exports["./core-v1"].types', coreExport.types],
    ['exports["./core-v1"].import', coreExport.import],
    ['exports["./core-v1"].require', coreExport.require],
  ]) {
    assert.equal(typeof value, 'string', `${label} must be a package-relative file target`);
  }

  return [...new Map([
    ['main', manifest.main],
    ['module', manifest.module],
    ['types', manifest.types],
    ['unpkg', manifest.unpkg],
    ['root types', rootExport.types],
    ['root import', rootExport.import],
    ['root require', rootExport.require],
    ['Core v1 types', coreExport.types],
    ['Core v1 import', coreExport.import],
    ['Core v1 require', coreExport.require],
  ].map(([label, target]) => [target, { label, target }])).values()];
};

const assertPackageTargets = async (packageRoot, manifest) => {
  const targets = packageTargets(manifest);
  for (const { label, target } of targets) {
    assert.match(target, /^\.\//u, `${label} must stay inside the package: ${target}`);
    const path = resolve(packageRoot, target);
    assert(
      path.startsWith(`${resolve(packageRoot)}${sep}`),
      `${label} escapes the package root: ${target}`,
    );
    await assertFile(path, label);
  }
  return targets.map(({ target }) => target).sort();
};

const run = async (command, args, cwd, extraEnvironment = {}) => {
  const result = await execute(command, args, {
    cwd,
    env: {
      ...process.env,
      npm_config_audit: 'false',
      npm_config_fund: 'false',
      npm_config_update_notifier: 'false',
      ...extraEnvironment,
    },
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.stderr.trim()) process.stderr.write(result.stderr);
  return result.stdout;
};

const resolveTarball = async () => {
  const requested = process.argv[2] ?? process.env.CORE_V1_TARBALL;
  if (requested !== undefined) {
    const path = isAbsolute(requested) ? requested : resolve(process.cwd(), requested);
    assert.match(path, /\.tgz$/u, 'CORE_V1_TARBALL must point to an npm .tgz package');
    await assertFile(path, 'Packed package');
    return { buildScript: null, generated: false, path, sourceTargets: null };
  }

  const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  let buildScript = null;
  if (process.env.CORE_V1_SKIP_BUILD !== '1') {
    const scripts = manifest.scripts ?? {};
    buildScript = process.env.CORE_V1_BUILD_SCRIPT ?? 'build';
    assert.equal(
      typeof scripts[buildScript],
      'string',
      `Missing npm build script ${JSON.stringify(buildScript)}`,
    );
    await run(npmCommand, ['run', buildScript], root);
  }
  const sourceTargets = await assertPackageTargets(root, manifest);

  await mkdir(packDirectory, { recursive: true });
  const output = await run(
    npmCommand,
    ['pack', '--json', '--ignore-scripts', '--pack-destination', packDirectory],
    root,
  );
  const records = JSON.parse(output);
  assert.equal(records.length, 1, 'npm pack must produce exactly one archive');
  const path = join(packDirectory, records[0].filename);
  await assertFile(path, 'npm pack output');
  return { buildScript, generated: true, path, sourceTargets };
};

let report;
try {
  const tarball = await resolveTarball();
  await mkdir(consumerDirectory, { recursive: true });
  await writeFile(
    join(consumerDirectory, 'package.json'),
    `${JSON.stringify({
      name: 'patch-map-core-v1-packed-consumer',
      private: true,
      type: 'module',
    }, null, 2)}\n`,
  );

  await run(
    npmCommand,
    [
      'install',
      '--ignore-scripts',
      '--offline',
      '--no-audit',
      '--no-fund',
      '--package-lock=false',
      '--omit=peer',
      tarball.path,
    ],
    consumerDirectory,
    { npm_config_offline: 'true' },
  );

  const installedManifestPath = join(
    consumerDirectory,
    'node_modules',
    '@conalog',
    'patch-map',
    'package.json',
  );
  const installedManifest = JSON.parse(await readFile(installedManifestPath, 'utf8'));
  const installedPackageRoot = dirname(installedManifestPath);
  const installedTargets = await assertPackageTargets(installedPackageRoot, installedManifest);
  const coreExport = installedManifest.exports?.['./core-v1'];
  assert.equal(typeof coreExport.require, 'string', 'Core v1 needs a CJS runtime target');

  const esmConsumer = `import assert from 'node:assert/strict';
import * as api from ${JSON.stringify(packageSpecifier)};

const expected = ${JSON.stringify(expectedExports)};
assert.deepEqual(Object.keys(api).sort(), expected);
const input = Object.freeze({
  version: 1,
  entities: Object.freeze([
    Object.freeze({
      kind: 'rect', id: 'consumer-rect', x: 4, y: 6, width: 20, height: 10,
      fill: 0x336699ff, interactive: true,
    }),
  ]),
});
const before = JSON.stringify(input);
const scene = api.createCoreScene();
const loaded = scene.load(input);
assert.equal(loaded.entityCount, 1);
assert.equal(scene.snapshot().entities[0]?.id, 'consumer-rect');
assert.equal(JSON.stringify(input), before);
assert.equal(scene.flush().revision, scene.revision);
assert.equal(scene.destroy(), true);
assert.equal(scene.destroy(), false);
process.stdout.write(JSON.stringify({ exports: Object.keys(api).sort(), lifecycle: 'passed' }));
`;
  await writeFile(join(consumerDirectory, 'esm-consumer.mjs'), esmConsumer);
  const esmOutput = JSON.parse(
    await run(process.execPath, ['esm-consumer.mjs'], consumerDirectory),
  );
  assert.deepEqual(esmOutput.exports, expectedExports);
  assert.equal(esmOutput.lifecycle, 'passed');

  const cjsConsumer = `const assert = require('node:assert/strict');
const api = require(${JSON.stringify(packageSpecifier)});

const expected = ${JSON.stringify(expectedExports)};
assert.deepEqual(Object.keys(api).sort(), expected);
const scene = api.createCoreScene();
const loaded = scene.load({
  version: 1,
  entities: [{
    kind: 'bar', id: 'cjs-bar', x: 2, y: 3, width: 24, height: 6,
    fill: 0x55aa77ff, value: 0.5,
  }],
});
assert.equal(loaded.entityCount, 1);
assert.equal(scene.get('cjs-bar')?.data.value, 0.5);
assert.equal(scene.flush().revision, scene.revision);
assert.equal(scene.destroy(), true);
assert.throws(() => scene.snapshot(), api.CoreDestroyedError);
process.stdout.write(JSON.stringify({ exports: Object.keys(api).sort(), lifecycle: 'passed' }));
`;
  await writeFile(join(consumerDirectory, 'cjs-consumer.cjs'), cjsConsumer);
  const cjsOutput = JSON.parse(
    await run(process.execPath, ['cjs-consumer.cjs'], consumerDirectory),
  );
  assert.deepEqual(cjsOutput.exports, expectedExports);
  assert.equal(cjsOutput.lifecycle, 'passed');

  const typedConsumer = `import {
  createCoreScene,
  type CoreScene,
  type EntityRef,
  type SceneDocument,
} from ${JSON.stringify(packageSpecifier)};

const document: SceneDocument = {
  version: 1,
  entities: [{
    kind: 'rect', id: 'typed-rect', x: 0, y: 0, width: 8, height: 8,
    fill: 0x102030ff, interactive: true,
  }],
};
const scene: CoreScene = createCoreScene();
scene.load(document);
const ref: EntityRef | null = scene.ref('typed-rect');
if (ref === null || scene.get(ref)?.id !== 'typed-rect') throw new Error('typed ref failed');
scene.destroy();
`;
  await Promise.all([
    writeFile(join(consumerDirectory, 'consumer.ts'), typedConsumer),
    writeFile(
      join(consumerDirectory, 'tsconfig.json'),
      `${JSON.stringify({
        compilerOptions: {
          exactOptionalPropertyTypes: true,
          lib: ['ES2022', 'DOM'],
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          noEmit: true,
          skipLibCheck: false,
          strict: true,
          target: 'ES2022',
          types: [],
        },
        files: ['consumer.ts'],
      }, null, 2)}\n`,
    ),
  ]);
  await run(
    process.execPath,
    [join(root, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', 'tsconfig.json'],
    consumerDirectory,
  );

  report = {
    cjs: 'passed',
    buildScript: tarball.buildScript,
    esm: 'passed',
    exports: expectedExports,
    installedTargets,
    nodeNext: 'passed',
    package: `${installedManifest.name}@${installedManifest.version}`,
    packageSpecifier,
    packedInput: tarball.generated ? 'generated-after-build' : 'provided-tarball',
    sourceTargets: tarball.sourceTargets,
    scripts: 'ignored',
    network: 'offline',
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} finally {
  if (keepTemporary) {
    process.stderr.write(`Core v1 packed consumer retained at ${temporaryRoot}\n`);
  } else {
    await rm(temporaryRoot, { force: true, recursive: true });
  }
}
