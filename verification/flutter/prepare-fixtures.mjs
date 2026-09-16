import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Escaping dollar signs prevents Dart interpolation while JSON escaping preserves
// every source byte in the decoded UTF-8 fixture string.
export function dartString(value) {
  return JSON.stringify(value).replaceAll('$', '\\$');
}

export async function renderSharedFixtures(root = process.cwd()) {
  const directory = resolve(root, 'conformance/fixtures');
  const names = (await readdir(directory)).filter((name) => name.endsWith('.json')).sort();
  const entries = await Promise.all(names.map(async (name) => {
    const source = await readFile(resolve(directory, name), 'utf8');
    JSON.parse(source);
    return `  ${dartString(name.slice(0, -5))}: ${dartString(source)},`;
  }));
  const sceneDirectory = resolve(root, 'conformance/scenes');
  for (const name of (await readdir(sceneDirectory)).filter((name) => name.endsWith('.json')).sort()) {
    const source = await readFile(resolve(sceneDirectory, name), 'utf8');
    JSON.parse(source);
    entries.push(`  ${dartString(`scenes/${name.slice(0, -5)}`)}: ${dartString(source)},`);
  }
  entries.push(`  ${dartString('manifest')}: ${dartString(await readFile(resolve(root, 'conformance/manifest.json'), 'utf8'))},`);
  return [
    '// Generated from conformance/{fixtures,scenes}/*.json. Do not edit.',
    '// Regenerate: node verification/flutter/prepare-fixtures.mjs',
    '// Dart source permits hot restart to pick up shared scene changes.',
    '// dart format off',
    'const sharedFixtureJson = <String, String>{',
    ...entries,
    '};',
    '',
  ].join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const target = resolve('packages/flutter/example/lib/shared_fixtures.dart');
  await writeFile(target, await renderSharedFixtures());
  console.log(target);
}
