import { readdir, readFile } from 'node:fs/promises';
import { resolve, relative, dirname } from 'node:path';
import { createHash } from 'node:crypto';

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
export function dartImportViolations(source, file, packageRoot) {
  const errors = [];
  for (const directive of source.matchAll(/\b(?:import|export|part)\s+(?!of\b)[^;]+;/gu)) {
    for (const match of directive[0].matchAll(/['"]([^'"]+)['"]/gu)) {
      const specifier = match[1];
      const target = specifier.startsWith('package:conalog_patch_map/')
        ? resolve(packageRoot, 'lib', specifier.slice('package:conalog_patch_map/'.length))
        : !specifier.includes(':') ? resolve(dirname(file), specifier) : null;
      if (target !== null && !relative(packageRoot, target).startsWith('lib/')) {
        errors.push(`${relative(packageRoot, file)}: product import outside lib: ${specifier}`);
      }
      if (/^(?:file:|https?:)/u.test(specifier)) errors.push(`Non-isolated Dart import: ${specifier}`);
    }
  }
  return errors;
}
export async function verifyFlutterPackage(root = process.cwd()) {
  const packageRoot = resolve(root, 'packages/flutter');
  const pubspec = await readFile(resolve(packageRoot, 'pubspec.yaml'), 'utf8');
  if (!/^name: conalog_patch_map$/mu.test(pubspec)) throw new Error('Unexpected Dart package name');
  const pairs = [['packages/javascript/src/resources/fonts/FiraCode-VF.woff2', 'assets/fonts/FiraCode-VF.woff2'], ['docs/assets/fira-code-6.2-license.txt', 'assets/fonts/LICENSE.txt']];
  for (const icon of await readdir(resolve(root, 'packages/javascript/src/resources/icons'))) {
    if (icon.endsWith('.svg')) pairs.push([`packages/javascript/src/resources/icons/${icon}`, `assets/icons/${icon}`]);
  }
  for (const [source, target] of pairs) {
    if (sha256(await readFile(resolve(root, source))) !== sha256(await readFile(resolve(packageRoot, target)))) throw new Error(`Managed asset drift: ${target}`);
  }
  const provenance = JSON.parse(await readFile(resolve(packageRoot, 'assets/fonts/provenance.json')));
  const native = await readFile(resolve(packageRoot, 'assets/fonts/FiraCode-VF.ttf'));
  if (provenance.sourceSha256 !== sha256(await readFile(resolve(root, pairs[0][0]))) || provenance.nativeSha256 !== sha256(native) || native.readUInt32BE(0) !== 0x00010000) throw new Error('Native font provenance drift');
  return { packageRoot, assetCopies: pairs.length };
}
