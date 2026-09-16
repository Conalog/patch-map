import { readFileSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Deliberately support the channels that this repository publishes. No build
// metadata or arbitrary pre-release identifiers that pub/npm order differently.
export function parseVersion(version) {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(alpha|beta|rc)\.(0|[1-9]\d*))?$/u.exec(version);
  if (!match) throw new Error(`unsupported release version: ${version}`);
  return { version, stable: !match[4], order: [BigInt(match[1]), BigInt(match[2]), BigInt(match[3]),
    BigInt(match[4] ? ['alpha', 'beta', 'rc'].indexOf(match[4]) : 3), BigInt(match[5] ?? 0)] };
}

export function requireForwardVersion(target, current) {
  const next = parseVersion(target).order;
  if (!current) return;
  const previous = parseVersion(current).order;
  for (let index = 0; index < next.length; index += 1) {
    if (next[index] > previous[index]) return;
    if (next[index] < previous[index]) break;
  }
  throw new Error(`refusing to move release channel backward from ${current} to ${target}`);
}

// These pubspec fields are repository-owned, unquoted top-level scalars.
// Reject unexpected syntax rather than silently parsing a different identity.
export function pubspecField(text, name) {
  const matches = [...text.matchAll(new RegExp(`^${name}: ([^\\r\\n]+)$`, 'gm'))];
  if (matches.length !== 1 || !/^[a-zA-Z0-9_.+-]+$/u.test(matches[0][1])) {
    throw new Error(`pubspec must contain one plain ${name} scalar`);
  }
  return matches[0][1];
}

export function releaseMetadata(runtime, tag, root = process.cwd()) {
  const json = (path) => JSON.parse(readFileSync(`${root}/${path}`, 'utf8'));
  const manifest = json('.release-please-manifest.json');
  let version, prefix, path;
  if (runtime === 'npm') {
    path = 'packages/javascript';
    const pkg = json(`${path}/package.json`);
    if (pkg.name !== '@conalog/patch-map') throw new Error('unexpected npm identity');
    version = pkg.version;
    prefix = 'v';
  } else if (runtime === 'dart') {
    path = 'packages/flutter';
    const pubspec = readFileSync(`${root}/${path}/pubspec.yaml`, 'utf8');
    if (pubspecField(pubspec, 'name') !== 'conalog_patch_map' || /^publish_to:/mu.test(pubspec)) throw new Error('unexpected Dart publication identity');
    version = pubspecField(pubspec, 'version');
    prefix = 'dart-v';
  } else throw new Error('runtime must be npm or dart');
  const { stable } = parseVersion(version);
  if (tag !== `${prefix}${version}` || manifest[path] !== version) throw new Error('tag, package and release manifest must match');
  return { 'package-version': version, 'dist-tag': stable ? 'latest' : 'next', 'release-kind': stable ? 'stable' : 'prerelease' };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [runtime, tag] = process.argv.slice(2);
  const result = releaseMetadata(runtime, tag);
  const output = Object.entries(result).map(([key, value]) => `${key}=${value}\n`).join('');
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, output);
  else process.stdout.write(output);
}
