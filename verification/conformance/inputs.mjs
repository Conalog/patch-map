import { assetConsumerPaths, ASSET_PACKAGES } from '../assets/catalog.mjs';

// Markdown explains the contract; executable fixtures, schemas and inventories
// define it. Unknown non-document inputs remain conservative product inputs.
export function isContractInput(path) {
  return path.startsWith('conformance/') && !path.endsWith('.md');
}

export const NATIVE_HOST_ROOTS = ['packages/flutter/example/android', 'packages/flutter/example/ios'];
export const NATIVE_PACKAGE_INPUTS = new Set([
  'packages/flutter/pubspec.yaml', 'packages/flutter/pubspec.lock',
  'packages/flutter/toolchains.json', 'packages/flutter/.fvmrc',
  'packages/flutter/example/pubspec.yaml', 'packages/flutter/example/pubspec.lock',
]);
export const SOURCE_SCOPES = ['npm', 'dart', 'native', 'android', 'ios'];
export const isNativeBuildInput = (path) => NATIVE_PACKAGE_INPUTS.has(path)
  || NATIVE_HOST_ROOTS.some((directory) => path.startsWith(`${directory}/`));

export function isScopedSource(path, scope) {
  if (!SOURCE_SCOPES.includes(scope)) throw new Error(`Unknown evidence source scope: ${scope}`);
  const native = scope === 'native' || scope === 'android' || scope === 'ios';
  const generator = ['verification/assets/catalog.mjs', 'verification/assets/prepare.mjs'].includes(path);
  if (path.startsWith('shared/assets/')) return assetConsumerPaths(path).includes(scope === 'npm' ? ASSET_PACKAGES.javascript : ASSET_PACKAGES.flutter);
  if (isContractInput(path) || generator) return true;
  if (native) {
    return NATIVE_PACKAGE_INPUTS.has(path)
      || path.startsWith('packages/flutter/lib/')
      || path.startsWith('packages/flutter/example/lib/')
      || path.startsWith('packages/flutter/example/integration_test/')
      || path.startsWith('packages/flutter/example/test_driver/')
      || (scope === 'native' ? NATIVE_HOST_ROOTS : [`packages/flutter/example/${scope}`]).some((directory) => path.startsWith(`${directory}/`));
  }
  if (path === '.nvmrc' || path === 'verification/package.json'
    || (path.startsWith('verification/dependencies/') && !path.endsWith('.test.mjs') && !path.endsWith('.md'))
    || (path.startsWith('verification/conformance/') && !path.endsWith('.md') && !path.endsWith('.test.mjs'))) return true;
  if (scope === 'npm') return path.startsWith('packages/javascript/') || path === 'package-lock.json';
  return path.startsWith('packages/flutter/') || path.startsWith('verification/flutter/') || path === 'package-lock.json';
}
