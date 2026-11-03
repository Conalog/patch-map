import { cpSync, mkdirSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';

const flutterPackage = 'packages/flutter';
const sharedTestFixtures = [
  'conformance/fixtures/gallery.json',
  'packages/javascript/tests/fixtures/large-grid-scene.json',
];
const localState = new Set(['.dart_tool', '.fvm', 'build', '.symlinks']);

export function copySdkWorkspace(root, workspace) {
  const sourcePackage = join(root, flutterPackage);
  const packageRoot = join(workspace, flutterPackage);
  cpSync(sourcePackage, packageRoot, {
    recursive: true,
    filter: (path) => !relative(sourcePackage, path).split(sep).some((part) => localState.has(part)),
  });
  for (const fixture of sharedTestFixtures) {
    const destination = join(workspace, fixture);
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(join(root, fixture), destination);
  }
  return packageRoot;
}
