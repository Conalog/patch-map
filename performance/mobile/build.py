#!/usr/bin/env python3
"""Prepare isolated prebuilt candidates before any benchmark runs."""
import argparse
import json
import os
from pathlib import Path
import shutil
import shlex
import subprocess
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / '.artifacts/performance/mobile'
parser = argparse.ArgumentParser()
parser.add_argument('runtime', choices=['jsf', 'flutter_js', 'quickjs_engine'])
parser.add_argument('--label', default='v1')
args = parser.parse_args()
flutter = os.environ.get('FLUTTER_BIN', 'flutter')
app = BASE / 'app'
out = BASE / 'builds' / args.runtime / args.label
out.mkdir(parents=True, exist_ok=True)
if (out / 'complete.json').exists():
    raise RuntimeError('Completed build exists; use a new label')
env = {**os.environ, 'LANG': 'en_US.UTF-8', 'LC_ALL': 'en_US.UTF-8'}

def run(command, name, cwd=app):
    index = 1
    while (out / f'{name}-{index}.log').exists():
        index += 1
    with (out / f'{name}-{index}.log').open('w') as log:
        result = subprocess.run(command, cwd=cwd, env=env, stdout=log, stderr=subprocess.STDOUT)
    if result.returncode:
        raise RuntimeError(f'{name} failed; inspect {out}/{name}-{index}.log')
    print(f'{args.runtime}: {name} succeeded', flush=True)

run(['node', 'performance/mobile/prepare.mjs', args.runtime], 'prepare', ROOT)
run([flutter, 'pub', 'get'], 'pub-get')
run([flutter, 'analyze', 'lib'], 'analyze')
lock = ROOT / 'performance/mobile/locks' / f'{args.runtime}.lock'
if not lock.exists():
    shutil.copy2(app / 'pubspec.lock', lock)
(out / 'assets').mkdir(exist_ok=True)
shutil.copy2(app / 'pubspec.lock', out / 'pubspec.lock')
shutil.copy2(app / 'assets/manifest.json', out / 'assets/manifest.json')
run([flutter, 'build', 'ios', '--simulator', '--debug',
     f'--dart-define=RUN_ID=ios-{args.runtime}-{args.label}'], 'ios-build')
runner = out / 'build/ios/iphonesimulator/Runner.app'
runner.parent.mkdir(parents=True, exist_ok=True)
shutil.copytree(app / 'build/ios/iphonesimulator/Runner.app', runner, dirs_exist_ok=True)
if args.runtime == 'quickjs_engine':
    symbols = subprocess.check_output(['xcrun', 'nm', '-gU',
        str(runner / 'Frameworks/quickjs_engine.framework/quickjs_engine')], text=True)
    required = ['_jsNewRuntime', '_jsEval', '_jsCall', '_jsGetArrayBuffer', '_jsFreeRuntime']
    names = {line.split()[-1] for line in symbols.splitlines() if line.split()}
    if not set(required) <= names:
        raise RuntimeError(f'Missing iOS QuickJS FFI exports: {set(required) - names}')
    (out / 'ios-native-exports.json').write_text(json.dumps(required))
run([flutter, 'build', 'apk', '--profile', '--target-platform', 'android-arm64',
     f'--dart-define=RUN_ID=android-{args.runtime}-{args.label}'], 'android-build')
apk = out / 'build/app/outputs/flutter-apk/app-profile.apk'
apk.parent.mkdir(parents=True, exist_ok=True)
shutil.copy2(app / 'build/app/outputs/flutter-apk/app-profile.apk', apk)
if args.runtime in ('jsf', 'quickjs_engine'):
    packages = json.loads((app / '.dart_tool/package_config.json').read_text())['packages']
    package = next(row for row in packages if row['name'] == args.runtime)
    package_root = Path(unquote(urlparse(package['rootUri']).path))
    commands_path = package_root / 'android/.cxx/tools/profile/arm64-v8a/compile_commands.json'
    commands = json.loads(commands_path.read_text())
    selected = [row for row in commands if row['file'].endswith(('.c', '.cpp'))]
    for row in selected:
        flags = shlex.split(row['command'])
        optimization = [flag for flag in flags if flag in ('-O0', '-O1', '-O2', '-O3', '-Os', '-Oz', '-Og')]
        if not optimization or optimization[-1] != '-O3' or '-DNDEBUG' not in flags:
            raise RuntimeError(f'Native Android engine is not optimized: {row}')
    if not any(row['file'].endswith('/quickjs.c') for row in selected):
        raise RuntimeError('Missing QuickJS compiler evidence')
    shutil.copy2(commands_path, out / 'android-native-compile-commands.json')
    result = subprocess.run(['xcodebuild', '-project', 'ios/Pods/Pods.xcodeproj', '-target', args.runtime,
                             '-configuration', 'Debug', '-sdk', 'iphonesimulator', '-showBuildSettings', '-json'],
                            cwd=app, env=env, capture_output=True, text=True, check=True)
    settings = json.loads(result.stdout)[0]['buildSettings']
    evidence = {key: settings.get(key) for key in
                ('GCC_OPTIMIZATION_LEVEL', 'GCC_PREPROCESSOR_DEFINITIONS', 'SDKROOT', 'CONFIGURATION')}
    (out / 'ios-native-build-settings.json').write_text(json.dumps(evidence, indent=2))
    if evidence['GCC_OPTIMIZATION_LEVEL'] != '3' or 'NDEBUG=1' not in evidence['GCC_PREPROCESSOR_DEFINITIONS']:
        raise RuntimeError(f'Native iOS engine is not optimized: {evidence}')
(out / 'complete.json').write_text(json.dumps({'runtime': args.runtime, 'label': args.label}))
print(out)
