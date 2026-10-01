import { readFile } from 'node:fs/promises';
import { resolve, relative, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { verifyPreparedFlutterAssets } from '../assets/prepare.mjs';

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
  return { packageRoot, assetCopies: verifyPreparedFlutterAssets(root) };
}
