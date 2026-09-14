import { build } from 'esbuild';
import { mkdir, writeFile, readFile, cp, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import vm from 'node:vm';

const root = resolve(import.meta.dirname, '../..');
const app = resolve(root, '.artifacts/performance/mobile/app');
const runtime = process.argv[2] ?? 'jsf';
const versions = { jsf: '1.1.0', flutter_js: '0.8.7', quickjs_engine: '0.1.5' };
if (!Object.hasOwn(versions, runtime)) throw new Error(`Unknown runtime ${runtime}`);
try { await access(`${app}/.metadata`); } catch {
  execFileSync(process.env.FLUTTER_BIN ?? 'flutter', ['create', '--no-pub', '--platforms=android,ios',
    '--org', 'dev.patchmap', '--project-name', 'patch_map_mobile_bench', app], { cwd: root, stdio: 'inherit' });
}
const gradlePath = `${app}/android/app/build.gradle.kts`;
const gradle = await readFile(gradlePath, 'utf8');
await writeFile(gradlePath, gradle.replace(/ndkVersion = .*/, 'ndkVersion = "28.2.13676358"'));
// Configure plugin native builds before Flutter's evaluationDependsOn(":app").
const rootGradlePath = `${app}/android/build.gradle.kts`;
let rootGradle = await readFile(rootGradlePath, 'utf8');
const ndkConfig = `// PatchMap NDK begin
subprojects {
    plugins.withId("com.android.library") {
        extensions.findByName("android")?.let { android ->
            android.javaClass.methods.firstOrNull {
                it.name == "setNdkVersion" && it.parameterCount == 1
            }?.invoke(android, "28.2.13676358")
            if (project.name in listOf("jsf", "quickjs_engine")) {
                fun get(target: Any, name: String): Any = target.javaClass.methods.first {
                    it.name == name && it.parameterCount == 0
                }.invoke(target)
                val cmake = get(get(get(android, "getDefaultConfig"), "getExternalNativeBuild"), "getCmake")
                for (name in listOf("getCFlags", "getCppFlags")) {
                    @Suppress("UNCHECKED_CAST")
                    val flags = get(cmake, name) as MutableList<String>
                    flags.addAll(listOf("-O3", "-DNDEBUG"))
                }
            }
        }
    }
}
// PatchMap NDK end
`;
rootGradle = rootGradle.replace(/\/\/ PatchMap NDK begin[\s\S]*?\/\/ PatchMap NDK end\n?/, '');
await writeFile(rootGradlePath, ndkConfig + rootGradle);
await cp(resolve(import.meta.dirname, 'Podfile'), `${app}/ios/Podfile`);
const activityPath = `${app}/android/app/src/main/kotlin/dev/patchmap/patch_map_mobile_bench/MainActivity.kt`;
await writeFile(activityPath, `package dev.patchmap.patch_map_mobile_bench

import android.os.Bundle
import android.view.WindowManager
import io.flutter.embedding.android.FlutterActivity

class MainActivity : FlutterActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }
}
`);
await mkdir(`${app}/assets`, { recursive: true });
const result = await build({
  entryPoints: [resolve(import.meta.dirname, 'kernel.ts')], bundle: true,
  format: 'iife', target: 'es2020', write: false, minify: false,
});
const source = result.outputFiles[0].text;
await writeFile(`${app}/assets/kernel.js`, source);
const context = vm.createContext({});
vm.runInContext(source, context);
const oracle = {};
for (const count of [5000, 10000]) {
  for (const stride of [1, 10]) {
    const heights = Array.from({ length: count / stride }, (_, i) => 1 + (i % 20));
    oracle[`${count}:${stride}`] = context.projectJson(heights, stride);
  }
}
await writeFile(`${app}/assets/oracle.json`, JSON.stringify(oracle));
await cp(resolve(import.meta.dirname, 'lib'), `${app}/lib`, { recursive: true });
try { await cp(resolve(import.meta.dirname, `locks/${runtime}.lock`), `${app}/pubspec.lock`); } catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
await cp(resolve(import.meta.dirname, `adapters/${runtime}.dart`), `${app}/lib/runtime.dart`);
const base = await readFile(resolve(import.meta.dirname, 'pubspec.base.yaml'), 'utf8');
await writeFile(`${app}/pubspec.yaml`, base.replace('  flutter:\n', `  ${runtime}: ${versions[runtime]}\n  flutter:\n`));
const harnessFiles = ['kernel.ts', 'lib/main.dart', 'lib/geometry.dart', `adapters/${runtime}.dart`, 'prepare.mjs', 'Podfile'];
const harnessHashes = Object.fromEntries(await Promise.all(harnessFiles.map(async (file) => [
  file, createHash('sha256').update(await readFile(resolve(import.meta.dirname, file))).digest('hex'),
])));
const manifest = {
  harnessHashes,
  protocol: 1, runtime, version: versions[runtime],
  nativeBuildPolicy: runtime === 'flutter_js' ? 'package-prebuilt-android/system-jsc-ios' : 'source-O3-NDEBUG',
  iosIntegration: runtime === 'quickjs_engine' ? 'explicit-published-native-sources' : 'stock-pod',
  sourceRevision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  kernelSha256: createHash('sha256').update(source).digest('hex'),
  sourceFileSha256: createHash('sha256').update(await readFile(resolve(root, 'src/rendering/mesh/rounded-bar-geometry.ts'))).digest('hex'),
};
await writeFile(`${app}/assets/manifest.json`, JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ app, ...manifest }, null, 2));
