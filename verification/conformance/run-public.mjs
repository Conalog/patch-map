import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { compareObservations, compareRuns, contractFingerprint } from './compare.mjs';
import { CONTRACT_REVISION, readFixtures } from './fixtures.mjs';

const exec = promisify(execFile);
const sha = (value) => createHash('sha256').update(value).digest('hex');
const defaultDart = () => process.env.DART_BIN ??
  (process.env.FLUTTER_ROOT ? resolve(process.env.FLUTTER_ROOT, 'bin/dart') :
    process.env.FLUTTER_BIN ? resolve(dirname(process.env.FLUTTER_BIN), 'dart') : 'dart');

function assertTrace(run, runtime, fixtures) {
  if (run?.runtime !== runtime || run.schemaRevision !== CONTRACT_REVISION) throw new Error(`Invalid ${runtime} trace identity`);
  const byId = new Map(fixtures.map((fixture) => [fixture.id, fixture]));
  for (const observation of run.observations ?? []) {
    const fixture = byId.get(observation.fixtureId);
    if (!fixture || !observation.initial || !Array.isArray(observation.failures) || observation.failures.length !== 0) {
      throw new Error(`${runtime}/${observation.fixtureId}: missing initial observation or failed command expectations`);
    }
    compareObservations(observation.steps?.map((step) => step.commandId), fixture.commands.map((command) => command.id), `${runtime}/${fixture.id}/commands`);
  }
}

/** Runs the same browser fixture adapter as the comparison UI in a private
 * browser/server, then compares a separate Dart process. This is source-level
 * semantic CI evidence; installed consumers and native pixels have other gates. */
export async function runPublicConformance({ root = process.cwd(), dartBin = defaultDart(),
  outputDirectory = resolve(root, '.artifacts/flutter/public-ci'), timeoutMs = 120_000 } = {}) {
  const directory = resolve(root, outputDirectory);
  await mkdir(directory, { recursive: true });
  const fixtures = await readFixtures(root);
  const manifest = JSON.parse(await readFile(resolve(root, 'conformance/manifest.json'), 'utf8'));
  compareObservations(fixtures.map((fixture) => fixture.id).sort(), [...manifest.fixtures].sort(), '$.manifest.fixtures');
  const fingerprint = await contractFingerprint(root);
  const browserMessages = [];
  const started = Date.now();
  let server, browser, timer;
  const save = async (name, value) => {
    const text = `${JSON.stringify(value, null, 2)}\n`;
    await writeFile(resolve(directory, name), text);
    return { path: relative(root, resolve(directory, name)), sha256: sha(text) };
  };
  try {
    server = await createServer({ root,
      configFile: resolve(root, 'verification/conformance/vite.config.ts'),
      cacheDir: resolve(directory, 'vite-cache'), logLevel: 'warn',
      server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false, open: false },
    });
    await server.listen();
    const address = server.httpServer?.address();
    if (!address || typeof address === 'string') throw new Error('Vite did not allocate a private TCP port');
    browser = await chromium.launch({ headless: true, timeout: timeoutMs });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
    const pageErrors = [];
    page.on('console', (message) => browserMessages.push({ type: message.type(), text: message.text() }));
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.goto(`http://127.0.0.1:${address.port}/verification/conformance/web/`, { waitUntil: 'load', timeout: timeoutMs });
    // The UI publishes its handle before async initial mount has completed.
    await page.waitForFunction(() => Boolean(window.patchMapComparison?.snapshot()), null, { timeout: timeoutMs });
    const npm = await Promise.race([
      page.evaluate(() => window.patchMapComparison.traces()),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('npm public trace timed out')), timeoutMs); }),
    ]);
    clearTimeout(timer);
    const npmReport = await save('npm-public.json', npm);
    if (pageErrors.length) throw new Error(`Uncaught browser errors: ${pageErrors.join('; ')}`);
    assertTrace(npm, 'npm', fixtures);
    // Finish renderer teardown before starting the independent Dart process.
    await browser.close(); browser = undefined;
    await server.close(); server = undefined;

    const args = [resolve(root, 'packages/flutter/test/engine/public_trace.dart'),
      ...fixtures.map((fixture) => resolve(root, `conformance/fixtures/${fixture.id}.json`))];
    let stdout, stderr;
    try {
      ({ stdout, stderr } = await exec(dartBin, args, { cwd: root, timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024, encoding: 'utf8' }));
    } catch (error) {
      await writeFile(resolve(directory, 'dart-stdout.log'), error.stdout ?? '');
      await writeFile(resolve(directory, 'dart-stderr.log'), error.stderr ?? '');
      throw new Error(`Dart public trace failed (${error.code ?? error.signal ?? 'process'}): ${error.message}`, { cause: error });
    }
    await writeFile(resolve(directory, 'dart-stderr.log'), stderr);
    const dart = { schemaRevision: CONTRACT_REVISION, runtime: 'dart', observations: JSON.parse(stdout) };
    const dartReport = await save('dart-public.json', dart);
    assertTrace(dart, 'dart', fixtures);
    const comparison = compareRuns(npm, dart, manifest.fixtures);
    if (await contractFingerprint(root) !== fingerprint) throw new Error('Conformance contract changed during public trace execution');
    const result = { schemaRevision: 'patch-map-public-ci/1', status: 'passed', contractFingerprint: fingerprint,
      ...comparison, comparedCommands: fixtures.reduce((count, fixture) => count + fixture.commands.length, 0),
      npmReport, dartReport, dartCommand: [dartBin, ...args], elapsedMs: Date.now() - started,
      scope: 'Exact public browser/Dart semantic observations; not native raster, device performance, or installed artifact qualification.' };
    await save('result.json', result);
    return result;
  } catch (error) {
    await save('result.json', { schemaRevision: 'patch-map-public-ci/1', status: 'failed',
      contractFingerprint: fingerprint, message: error.message, elapsedMs: Date.now() - started });
    throw error;
  } finally {
    clearTimeout(timer);
    await Promise.allSettled([browser?.close(), server?.close()]);
    await save('browser-console.json', browserMessages);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const options = {};
  for (let i = 0; i < args.length; i++) {
    if (!['--dart-bin', '--output'].includes(args[i]) || !args[i + 1]) throw new Error('usage: run-public.mjs [--dart-bin <dart>] [--output <directory>]');
    options[args[i] === '--dart-bin' ? 'dartBin' : 'outputDirectory'] = args[++i];
  }
  try { console.log(JSON.stringify(await runPublicConformance(options), null, 2)); }
  catch (error) { console.error(error.stack ?? error.message); process.exitCode = 1; }
}
