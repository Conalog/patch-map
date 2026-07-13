import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const REQUIRED_MANIFEST_SHA256 =
  'd72131daefb8142293c68f79bfce8386e3b5e93a77f2ec37702b04153cafde4e';
const IMPLEMENTATION_MUTABLE_PAYLOADS = new Set(['package.json']);
const PUBLIC_ROOT_FILES = new Set([
  'LICENSE',
  'README.md',
  'README_KR.md',
  'package.json',
]);
const FORBIDDEN_PACKAGE_SEGMENTS = new Set([
  '.git',
  '.perf-results',
  'artifacts',
  'fixtures',
  'node_modules',
  'oracle',
  'original',
  'reference',
  'references',
  'scripts',
  'src',
  'tests',
]);
const FORBIDDEN_PACKAGE_FILES = new Set([
  'export_manifest.json',
  'export_manifest.sha256',
  'implementation_handoff.md',
]);
const FORBIDDEN_EVIDENCE_TOKEN =
  /(?:^|[/_.-])(?:oracle|original|reference)(?=$|[/_.-])/iu;
const FORBIDDEN_ARCHIVE_SUFFIX =
  /\.(?:7z|bz2?|cab|crate|deb|dmg|ear|gz|iso|jar|rar|rpm|tar|tbz2?|tgz|txz|war|whl|xz|zip)$/iu;
const ALLOWED_DIST_SUFFIXES = [
  '.js',
  '.mjs',
  '.cjs',
  '.d.ts',
  '.d.mts',
  '.d.cts',
  '.css',
];
const SCANNABLE_RELEASE_FILE = /\.(?:[cm]?js|css|d\.[cm]?ts)$/iu;
const SOURCE_MAPPING_URL = /sourceMappingURL\s*=/iu;
const FORBIDDEN_EVIDENCE_MARKERS = [
  /EXPORT_MANIFEST(?:\.json|\.sha256)?/iu,
  /IMPLEMENTATION_HANDOFF(?:\.md)?/iu,
  /artifacts[\\/](?:expected|raw|screenshots)[\\/]/iu,
  /cleanroom[\\/]oracle(?:-v0\.10)?/iu,
  /patch-map-cleanroom-oracle-fixtures/iu,
  /reference[-_ ]package/iu,
  /(?:^|[\s'"`(])fixtures[\\/]/imu,
  /(?:\/Users\/|[A-Z]:\\Users\\)/u,
];
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const execute = promisify(execFile);
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

const isContained = (parent, child) => {
  const path = relative(parent, child);
  return path === '' || (
    path !== '..'
    && !path.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)
    && !isAbsolute(path)
  );
};

const rootStat = await lstat(root);
assert.equal(rootStat.isSymbolicLink(), false, 'Worktree root must not be a symlink');
assert.equal(rootStat.isDirectory(), true, 'Worktree root must be a directory');
const rootRealpath = await realpath(root);

const assertContainedRegularFile = async (path, label) => {
  assert.equal(typeof path, 'string', `${label} path must be a string`);
  assert(!path.includes('\0'), `${label} path contains a null byte`);
  const normalized = path.replaceAll('\\', '/');
  const segments = normalized.split('/');
  assert(
    normalized.length > 0
      && !normalized.startsWith('/')
      && segments.every((segment) => segment !== '' && segment !== '.' && segment !== '..'),
    `${label} is not a safe relative path: ${path}`,
  );
  const absolutePath = resolve(root, ...segments);
  assert(isContained(root, absolutePath), `${label} escapes the worktree: ${path}`);

  let currentPath = root;
  let targetStat;
  for (const segment of segments) {
    currentPath = resolve(currentPath, segment);
    const segmentStat = await lstat(currentPath);
    assert.equal(
      segmentStat.isSymbolicLink(),
      false,
      `${label} traverses a symlink: ${path}`,
    );
    targetStat = segmentStat;
  }
  assert.equal(targetStat?.isFile(), true, `${label} must resolve to a regular file`);
  const targetRealpath = await realpath(absolutePath);
  assert(
    isContained(rootRealpath, targetRealpath),
    `${label} realpath escapes the worktree: ${path}`,
  );
  return { absolutePath, normalized, stat: targetStat };
};

const manifestFile = await assertContainedRegularFile(
  'EXPORT_MANIFEST.json',
  'Manifest',
);
const manifestChecksumFile = await assertContainedRegularFile(
  'EXPORT_MANIFEST.sha256',
  'Manifest checksum',
);

const manifestBytes = await readFile(manifestFile.absolutePath);
const manifestDigest = sha256(manifestBytes);
assert.equal(
  manifestDigest,
  REQUIRED_MANIFEST_SHA256,
  'EXPORT_MANIFEST.json does not match the approved handoff digest',
);

const checksumText = await readFile(
  manifestChecksumFile.absolutePath,
  'utf8',
);
const declaredDigest = checksumText.trim().split(/\s+/u)[0];
assert.equal(
  declaredDigest,
  REQUIRED_MANIFEST_SHA256,
  'EXPORT_MANIFEST.sha256 does not declare the approved digest',
);

const manifest = JSON.parse(manifestBytes.toString('utf8'));
assert.equal(manifest.schemaVersion, 2);
assert.equal(manifest.implementationHandoffAllowed, true);
assert(Array.isArray(manifest.files));
assert.equal(manifest.files.length, 50);

const verified = [];
const implementationMutable = [];
for (const entry of manifest.files) {
  assert.equal(typeof entry.path, 'string');
  assert.equal(typeof entry.sizeBytes, 'number');
  assert.match(entry.sha256, /^[0-9a-f]{64}$/u);
  assert(
    !entry.path.toLowerCase().endsWith('.map'),
    `Manifest must not require opening a source map: ${entry.path}`,
  );
  const payload = await assertContainedRegularFile(entry.path, 'Manifest payload');
  const bytes = await readFile(payload.absolutePath);
  const matches =
    payload.stat.size === entry.sizeBytes && sha256(bytes) === entry.sha256;
  if (IMPLEMENTATION_MUTABLE_PAYLOADS.has(entry.path)) {
    implementationMutable.push({ path: entry.path, matchesOriginal: matches });
    continue;
  }
  assert.equal(matches, true, `Approved handoff payload changed: ${entry.path}`);
  verified.push(entry.path);
}

assert.deepEqual(
  [...IMPLEMENTATION_MUTABLE_PAYLOADS].sort(),
  implementationMutable.map(({ path }) => path).sort(),
  'The mutable payload allowlist must correspond exactly to manifest entries',
);

const { stdout: packOutput, stderr: packWarnings } = await execute(
  npmCommand,
  ['pack', '--dry-run', '--json', '--ignore-scripts'],
  {
    cwd: root,
    env: { ...process.env, npm_config_update_notifier: 'false' },
    maxBuffer: 10 * 1024 * 1024,
  },
);
if (packWarnings.trim()) process.stderr.write(packWarnings);

const packReports = JSON.parse(packOutput);
assert.equal(packReports.length, 1, 'npm pack must produce exactly one package');
assert(Array.isArray(packReports[0].files), 'npm pack did not report package files');
assert.equal(
  packReports[0].bundled?.length ?? 0,
  0,
  'npm bundled dependencies must not be embedded as package files',
);

const validatePackagePath = (path) => {
  assert.equal(typeof path, 'string');
  const normalized = path.replaceAll('\\', '/');
  const segments = normalized.split('/');
  const lowerPath = normalized.toLowerCase();
  assert(
    normalized.length > 0
      && !normalized.startsWith('/')
      && segments.every((segment) => segment !== '' && segment !== '.' && segment !== '..'),
    `Unsafe packaged path: ${path}`,
  );
  const publicRootFile = PUBLIC_ROOT_FILES.has(normalized);
  const allowedDistFile = normalized.startsWith('dist/')
    && ALLOWED_DIST_SUFFIXES.some((suffix) => lowerPath.endsWith(suffix));
  assert(
    publicRootFile || allowedDistFile,
    `Package path is outside the positive release file allowlist: ${path}`,
  );
  assert(
    !lowerPath.endsWith('.map'),
    `Source map would be packaged: ${path}`,
  );
  assert(
    !lowerPath.endsWith('.log'),
    `Log file would be packaged: ${path}`,
  );
  assert(
    !lowerPath.endsWith('.ts') || lowerPath.endsWith('.d.ts'),
    `TypeScript implementation source would be packaged: ${path}`,
  );
  assert(
    !FORBIDDEN_ARCHIVE_SUFFIX.test(normalized),
    `Nested package/archive would be packaged: ${path}`,
  );
  assert(
    segments.every(
      (segment) => !FORBIDDEN_PACKAGE_SEGMENTS.has(segment.toLowerCase()),
    ) && !FORBIDDEN_EVIDENCE_TOKEN.test(normalized),
    `Forbidden implementation/reference evidence path would be packaged: ${path}`,
  );
  assert(
    !FORBIDDEN_PACKAGE_FILES.has(segments.at(-1)?.toLowerCase()),
    `Approved handoff metadata would be packaged: ${path}`,
  );
  return normalized;
};

const rejectedPaths = [
  'dist/index.js.map',
  'dist/reference-package.json',
  'dist/original/source.js',
  'dist/reference-package.tgz',
  'dist/reference-package.tar.xz',
  'dist/reference-package.7z',
  'dist/unexpected.wasm',
  'dist/index.ts',
  'src/index.ts',
];
for (const rejectedPath of rejectedPaths) {
  assert.throws(
    () => validatePackagePath(rejectedPath),
    `Safety validator accepted prohibited package path: ${rejectedPath}`,
  );
}

const validatePackedText = (path, source) => {
  assert(
    !SOURCE_MAPPING_URL.test(source),
    `Packed release file contains an inline or external sourceMappingURL: ${path}`,
  );
  for (const marker of FORBIDDEN_EVIDENCE_MARKERS) {
    assert(
      !marker.test(source),
      `Packed release file contains forbidden clean-room evidence marker ${marker}: ${path}`,
    );
  }
};

for (const [name, source] of [
  ['external source map', '//# sourceMappingURL=index.js.map'],
  ['inline source map', '/*# sourceMappingURL=data:application/json;base64,AAAA */'],
  ['handoff evidence', 'const evidence = "EXPORT_MANIFEST.json";'],
  ['absolute workspace', 'const builtAt = "/Users/example/.codex/worktrees/example";'],
]) {
  assert.throws(
    () => validatePackedText(`synthetic ${name}`, source),
    `Packed text validator accepted ${name}`,
  );
}

const packedFiles = [];
const packedPaths = new Map();
for (const { path } of packReports[0].files) {
  const normalized = validatePackagePath(path);
  assert(!packedPaths.has(normalized), `Duplicate package path: ${normalized}`);
  const resolvedFile = await assertContainedRegularFile(normalized, 'Packed file');
  packedFiles.push(normalized);
  packedPaths.set(normalized, resolvedFile.absolutePath);
}

let scannedReleaseFiles = 0;
for (const [path, absolutePath] of packedPaths) {
  if (!SCANNABLE_RELEASE_FILE.test(path)) continue;
  const source = await readFile(absolutePath, 'utf8');
  validatePackedText(path, source);
  scannedReleaseFiles += 1;
}

for (const requiredEntry of [
  'package.json',
  'dist/index.js',
  'dist/index.cjs',
  'dist/index.umd.js',
  'dist/index.d.ts',
]) {
  assert(
    packedFiles.includes(requiredEntry),
    `Required package entry is missing: ${requiredEntry}`,
  );
}

process.stdout.write(
  `${JSON.stringify({
    manifestSha256: manifestDigest,
    payloadCount: manifest.files.length,
    immutablePayloadsVerified: verified.length,
    implementationMutable,
    packedFilesVerified: packedFiles.length,
    packedReleaseContentsScanned: scannedReleaseFiles,
    sourceMapsPackaged: 0,
    forbiddenEvidencePathsPackaged: 0,
    forbiddenEvidenceContentsPackaged: 0,
    rejectedPathCasesVerified: rejectedPaths.length,
    rejectedContentCasesVerified: 4,
  })}\n`,
);
