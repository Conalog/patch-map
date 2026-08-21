import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const packageDirectory = await mkdtemp(join(tmpdir(), 'patch-map-package-'));

const run = (args, options = {}) => {
  const result = spawnSync(npmCommand, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    ...options,
  });

  if (result.status !== 0) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    throw new Error(
      `npm ${args.join(' ')} failed with status ${result.status}`,
    );
  }

  return result;
};

try {
  const packResult = run([
    'pack',
    '--ignore-scripts',
    '--pack-destination',
    packageDirectory,
    '--json',
  ]);
  const [packageMetadata] = JSON.parse(packResult.stdout);
  const packageFiles = new Set(packageMetadata.files.map(({ path }) => path));
  const requiredFiles = [
    'dist/index.cjs',
    'dist/index.esm.js',
    'dist/index.umd.js',
    'dist/index.d.ts',
    'dist/index.d.cts',
    'dist/assets/fonts/OFL-1.1.txt',
  ];
  const missingFiles = requiredFiles.filter((path) => !packageFiles.has(path));

  if (missingFiles.length > 0) {
    throw new Error(
      `Package is missing required files: ${missingFiles.join(', ')}`,
    );
  }

  const umdBundle = await readFile(
    join(process.cwd(), 'dist/index.umd.js'),
    'utf8',
  );
  if (!umdBundle.includes('global.PIXI, global.nanoid$1, global.vm')) {
    throw new Error(
      'UMD globals changed: existing CDN consumers require PIXI, nanoid$1, and vm',
    );
  }

  const packagePath = join(packageDirectory, packageMetadata.filename);
  run(['exec', '--', 'publint', packagePath], { stdio: 'inherit' });
  run(['exec', '--', 'attw', packagePath], { stdio: 'inherit' });
} finally {
  await rm(packageDirectory, { recursive: true, force: true });
}
