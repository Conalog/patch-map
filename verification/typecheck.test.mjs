import assert from 'node:assert/strict';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import ts from 'typescript';

const root = fileURLToPath(new URL('../', import.meta.url));
const configPath = resolve(root, 'verification/tsconfig.json');
const config = ts.readConfigFile(configPath, ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, dirname(configPath));

// Compile a virtual consumer through the actual repository config without
// running it, changing sources, or emitting files.
function diagnostics(source) {
  const probe = resolve(root, 'verification/assets/typecheck-consumer-probe.mjs');
  const host = ts.createCompilerHost(parsed.options);
  const original = host.getSourceFile.bind(host);
  host.getSourceFile = (file, version, onError, shouldCreate) => file === probe
    ? ts.createSourceFile(file, source, version, true, ts.ScriptKind.JS)
    : original(file, version, onError, shouldCreate);
  const program = ts.createProgram([...parsed.fileNames, probe], parsed.options, host);
  return ts.getPreEmitDiagnostics(program);
}

test('tooling typecheck includes the selected executable asset modules', () => {
  assert.equal(config.error, undefined);
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.options.allowJs, true);
  assert.equal(parsed.options.checkJs, true);
  assert.equal(parsed.options.strict, true);
  assert.equal(parsed.options.noEmit, true);
  assert.deepEqual(parsed.fileNames.map((file) => relative(root, file)).sort(), [
    'verification/assets/catalog.mjs', 'verification/assets/prepare.mjs',
  ]);
});

test('asset input, output and consumer definitions reject incompatible callers before execution', () => {
  const imports = `import { prepareAssets, readSharedAssets } from './prepare.mjs';
import { ASSET_CATALOG, assetConsumerPaths } from './catalog.mjs';`;
  const valid = diagnostics(`${imports}
prepareAssets({ root: '.', packageName: 'javascript' });
assetConsumerPaths('shared/assets/icons/object.svg');
const bytes = readSharedAssets().get('icons/object.svg');
if (bytes) bytes.equals(bytes);
const first = ASSET_CATALOG[0];
if (first) first.targets.flutter.toUpperCase();`);
  assert.deepEqual(valid.map((item) => ts.flattenDiagnosticMessageText(item.messageText, '\n')), []);
  const invalid = diagnostics(`${imports}
prepareAssets({ packageName: 'dart' });
prepareAssets({ root: 123 });
assetConsumerPaths(42);
const bytes = readSharedAssets().get('icons/object.svg');
if (bytes) bytes.toUpperCase();
const first = ASSET_CATALOG[0];
if (first) first.targets.flutter = 'other';`);
  assert.equal(invalid.length, 5);
  assert.deepEqual(invalid.map((item) => item.code).sort(), [2322, 2322, 2339, 2345, 2540]);
});
