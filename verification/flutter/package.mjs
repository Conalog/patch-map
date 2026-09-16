import { readdir, readFile, stat } from 'node:fs/promises';
import { resolve, relative, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { renderSharedFixtures } from './prepare-fixtures.mjs';

const GENERATED = new Set(['.dart_tool', '.symlinks', 'build', 'Pods', '.plugin_symlinks']);
const HASH = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function files(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory() && !GENERATED.has(entry.name)) result.push(...await files(path));
    else if (entry.isFile()) result.push(path);
  }
  return result;
}

export function dartImportViolations(source, file, packageRoot) {
  const violations = [];
  const origin = relative(packageRoot, file).split('\\').join('/');
  const semantic = /^lib\/src\/(?:model|semantic)\//u.test(origin);
  const engine = /^lib\/src\/engine\//u.test(origin);
  for (const match of source.matchAll(/\b(?:import|export|part)\s+['"]([^'"]+)['"]/gu)) {
    const specifier = match[1];
    const target = specifier.startsWith('package:conalog_patch_map/') ? resolve(packageRoot, 'lib', specifier.slice('package:conalog_patch_map/'.length))
      : !specifier.includes(':') ? resolve(dirname(file), specifier) : null;
    if (target !== null) {
      const path = relative(packageRoot, target).split('\\').join('/');
      if (path.startsWith('../') || !path.startsWith('lib/')) violations.push(`${origin}: product import outside lib: ${specifier}`);
      if (semantic && /^lib\/src\/(?:engine|host|rendering|api)\//u.test(path)) violations.push(`${origin}: semantic import into upper layer: ${specifier}`);
      if (engine && /^lib\/src\/(?:host|rendering)\//u.test(path)) violations.push(`${origin}: engine imports concrete adapter: ${specifier}`);
    }
    if (semantic && (specifier.startsWith('package:') && !specifier.startsWith('package:conalog_patch_map/') || ['dart:ui', 'dart:io', 'dart:html', 'dart:js_interop'].includes(specifier))) {
      violations.push(`${origin}: semantic runtime requires Dart core only: ${specifier}`);
    }
    if (engine && (specifier.startsWith('package:flutter/') || specifier === 'dart:ui')) violations.push(`${origin}: engine imports Flutter host: ${specifier}`);
    if (/flutter_js|quickjs|jsf\/|webview_flutter/iu.test(specifier)) violations.push(`${origin}: JS/WebView runtime dependency`);
  }
  return violations;
}

export async function verifyFlutterPackage(root = process.cwd()) {
  const packageRoot = resolve(root, 'packages/flutter');
  const failures = [];
  const pubspec = await readFile(resolve(packageRoot, 'pubspec.yaml'), 'utf8');
  if (!/^name: conalog_patch_map$/mu.test(pubspec)) failures.push('Unexpected Dart package name');
  if (/^\s+(?:flutter_js|quickjs_engine|jsf|webview_flutter):/mu.test(pubspec)) failures.push('Dart package depends on JS/WebView runtime');
  for (const path of ['lib/conalog_patch_map.dart', 'README.md', 'CHANGELOG.md', 'LICENSE', '.pubignore']) {
    if (!(await stat(resolve(packageRoot, path)).catch(() => null))?.isFile()) failures.push(`Package file missing: ${path}`);
  }
  for (const file of await files(resolve(packageRoot, 'lib'))) {
    if (file.endsWith('.dart')) failures.push(...dartImportViolations(await readFile(file, 'utf8'), file, packageRoot));
    else if (/\.(?:mjs|cjs|js|ts)$/u.test(file)) failures.push(`Unexpected JavaScript product file: ${relative(packageRoot, file)}`);
  }
  const pairs = [['packages/javascript/src/resources/fonts/FiraCode-VF.woff2', 'assets/fonts/FiraCode-VF.woff2'],
    ['docs/assets/fira-code-6.2-license.txt', 'assets/fonts/LICENSE.txt']];
  for (const name of await readdir(resolve(root, 'packages/javascript/src/resources/icons'))) {
    if (name.endsWith('.svg')) pairs.push([`packages/javascript/src/resources/icons/${name}`, `assets/icons/${name}`]);
  }
  const sharedFixtures = await readFile(resolve(packageRoot, 'example/lib/shared_fixtures.dart'), 'utf8').catch(() => null);
  if (sharedFixtures !== await renderSharedFixtures(root)) failures.push('Generated example fixture drift: run node verification/flutter/prepare-fixtures.mjs');
  for (const [source, snapshot] of pairs) {
    const sourceBytes = await readFile(resolve(root, source));
    const snapshotBytes = await readFile(resolve(packageRoot, snapshot)).catch(() => null);
    if (snapshotBytes === null || HASH(sourceBytes) !== HASH(snapshotBytes)) failures.push(`Managed package input drift: ${snapshot} != ${source}`);
  }
  const fontProvenance = JSON.parse(await readFile(resolve(packageRoot, 'assets/fonts/provenance.json'), 'utf8'));
  const nativeFont = await readFile(resolve(packageRoot, 'assets/fonts/FiraCode-VF.ttf'));
  const sourceFont = await readFile(resolve(root, 'packages/javascript/src/resources/fonts/FiraCode-VF.woff2'));
  if (fontProvenance.source !== 'packages/javascript/src/resources/fonts/FiraCode-VF.woff2' ||
    fontProvenance.native !== 'assets/fonts/FiraCode-VF.ttf' ||
    fontProvenance.sourceSha256 !== HASH(sourceFont) || fontProvenance.nativeSha256 !== HASH(nativeFont) ||
    fontProvenance.tool !== 'fontTools' || fontProvenance.toolVersion !== '4.60.1' ||
    fontProvenance.glyphCount !== 2030 || nativeFont.readUInt32BE(0) !== 0x00010000 ||
    JSON.stringify(fontProvenance.axes) !== JSON.stringify([{ tag: 'wght', min: 300, default: 300, max: 700 }])) {
    failures.push('Native SFNT provenance, identity or variable font axes differ from the npm WOFF2 source');
  }
  const unicodeSource = await readFile(resolve(root, 'packages/javascript/src/semantic/unicode-text-data.ts'), 'utf8');
  const unicodeDart = await readFile(resolve(packageRoot, 'lib/src/semantic/text/unicode_data.dart'), 'utf8');
  for (const name of ['EXTEND_RANGES', 'SPACING_MARK_RANGES', 'PREPEND_RANGES']) {
    const sourceTable = unicodeSource.match(new RegExp(`const ${name}:[\\s\\S]*?Object\\.freeze\\(\\[([\\s\\S]*?)\\]\\);`, 'u'))?.[1];
    const dartTable = unicodeDart.match(new RegExp(`const ${name.toLowerCase()} = <\\(int, int\\)>\\[([\\s\\S]*?)\\];`, 'u'))?.[1];
    const values = (table) => table?.match(/0x[0-9a-f]+/gu)?.map((value) => Number.parseInt(value, 16));
    if (!sourceTable || !dartTable || JSON.stringify(values(sourceTable)) !== JSON.stringify(values(dartTable))) {
      failures.push(`Pinned Unicode table drift: ${name}`);
    }
  }
  const npm = JSON.parse(await readFile(resolve(root, 'packages/javascript/package.json'), 'utf8'));
  if (npm.files.some((path) => /^(?:packages|conformance)(?:\/|$)/u.test(path))) failures.push('npm files include Dart/shared verification payload');
  if (failures.length) throw new Error(`Flutter package boundary verification failed:\n${failures.join('\n')}`);
  return { assetCopies: pairs.length, packageRoot };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await verifyFlutterPackage()));
}
