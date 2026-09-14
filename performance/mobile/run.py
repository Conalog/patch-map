#!/usr/bin/env python3
"""Run one prebuilt mobile app, preserve host/device state and raw results."""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import time

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / '.artifacts/performance/mobile'
parser = argparse.ArgumentParser()
parser.add_argument('platform', choices=['android', 'ios'])
parser.add_argument('runtime', choices=['jsf', 'flutter_js', 'quickjs_engine'])
parser.add_argument('--device', required=True)
parser.add_argument('--run-id', required=True)
parser.add_argument('--build-dir', type=Path)
parser.add_argument('--attempt', default='1')
parser.add_argument('--timeout', type=int, default=1800)
args = parser.parse_args()
out = BASE / 'runs' / (args.run_id if args.attempt == '1' else f'{args.run_id}-attempt-{args.attempt}')
out.mkdir(parents=True, exist_ok=False)
app = args.build_dir.resolve() if args.build_dir else BASE / 'app'
adb = os.environ.get('ADB_BIN', 'adb')
package = 'dev.patchmap.patch_map_mobile_bench' if args.platform == 'android' else 'dev.patchmap.patchMapMobileBench'

def call(command, check=True):
    result = subprocess.run(command, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    if check and result.returncode != 0:
        (out / 'command-failure.txt').write_text(f'{command!r}\n{result.stdout}')
        raise RuntimeError(f'{command!r} failed:\n{result.stdout}')
    return result.stdout

def state(label):
    commands = [[os.environ.get('FLUTTER_BIN', 'flutter'), '--version'], ['xcodebuild', '-version'], ['sw_vers'], ['sysctl', '-n', 'hw.model'], ['pmset', '-g', 'therm'], ['pmset', '-g', 'batt'],
                ['memory_pressure', '-Q'], ['vm_stat'], ['ps', '-ax', '-o', 'pid,pcpu,comm']]
    if args.platform == 'android':
        commands += [[adb, '-s', args.device, 'shell', *cmd] for cmd in [
            ['getprop', 'ro.product.model'], ['getprop', 'ro.kernel.qemu'], ['getprop', 'ro.build.fingerprint'],
            ['dumpsys', 'battery'], ['dumpsys', 'thermalservice'],
            ['dumpsys', 'display'], ['dumpsys', 'meminfo', package]]]
    else:
        commands += [['xcrun', 'simctl', 'list', 'devices', '--json']]
    data = [{'command': command, 'output': call(command, False)} for command in commands]
    (out / f'{label}-environment.json').write_text(json.dumps(data, indent=2))

manifest = json.loads((app / 'assets/manifest.json').read_text())
if manifest['runtime'] != args.runtime:
    raise RuntimeError('Build runtime does not match requested runtime')

for file in ['pubspec.lock', 'assets/manifest.json']:
    shutil.copy2(app / file, out / Path(file).name)
for file in ['android-native-compile-commands.json', 'ios-native-build-settings.json', 'ios-native-exports.json']:
    if (app / file).exists():
        shutil.copy2(app / file, out / file)
(out / 'target.json').write_text(json.dumps({'platform': args.platform, 'device': args.device, 'buildDir': str(app), 'attempt': args.attempt}, indent=2))
state('before')
if shutil.disk_usage(ROOT).free < 2 * 1024**3:
    raise RuntimeError('Less than 2 GiB free; benchmark is not accepted under disk pressure')
log = (out / 'console.log').open('w')
if args.platform == 'ios':
    call(['xcrun', 'simctl', 'install', args.device, str(app / 'build/ios/iphonesimulator/Runner.app')])
    container = Path(call(['xcrun', 'simctl', 'get_app_container', args.device, package, 'data']).strip())
    for suffix in ['.json', '.jsonl', '-error.json']:
        (container / 'tmp' / f'patchmap-{args.run_id}{suffix}').unlink(missing_ok=True)
    command = ['xcrun', 'simctl', 'launch', '--terminate-running-process', '--console', args.device, package]
else:
    call([adb, '-s', args.device, 'install', '-r', str(app / 'build/app/outputs/flutter-apk/app-profile.apk')])
    call([adb, '-s', args.device, 'shell', 'am', 'force-stop', package])
    call([adb, '-s', args.device, 'shell', 'am', 'start', '-W', '-n', f'{package}/.MainActivity'])
    pid = call([adb, '-s', args.device, 'shell', 'pidof', package]).strip()
    if not pid.isdigit():
        raise RuntimeError(f'No unique benchmark process: {pid!r}')
    command = [adb, '-s', args.device, 'logcat', '--pid', pid, '-v', 'raw', '-T', '1']
proc = subprocess.Popen(command, stdout=log, stderr=subprocess.STDOUT)
completed = None
try:
    deadline = time.monotonic() + args.timeout
    while time.monotonic() < deadline:
        time.sleep(1)
        if args.platform == 'ios':
            error_path = container / 'tmp' / f'patchmap-{args.run_id}-error.json'
            result_path = container / 'tmp' / f'patchmap-{args.run_id}.json'
            if error_path.exists():
                shutil.copy2(error_path, out / 'error.json')
                raise RuntimeError(error_path.read_text())
            if result_path.exists():
                try:
                    current = json.loads(result_path.read_text())
                    completed = {'path': str(result_path), 'blocks': len(current['blocks'])}
                except json.JSONDecodeError:
                    pass
        for line in (out / 'console.log').read_text(errors='replace').splitlines():
            marker = 'PATCHMAP_BENCH '
            if marker not in line:
                continue
            try:
                row = json.loads(line.split(marker, 1)[1])
            except json.JSONDecodeError:
                continue
            if row.get('event') == 'error':
                raise RuntimeError(row)
            if row.get('event') == 'complete':
                completed = row
                break
        if completed:
            break
        if proc.poll() is not None:
            raise RuntimeError(f'Console exited {proc.returncode}; inspect {out}')
    if not completed:
        raise TimeoutError(f'Benchmark did not finish; inspect {out}')
    if args.platform == 'ios':
        container = Path(call(['xcrun', 'simctl', 'get_app_container', args.device, package, 'data']).strip())
        shutil.copy2(container / 'tmp' / Path(completed['path']).name, out / 'result.json')
    else:
        raw = call([adb, '-s', args.device, 'exec-out', 'run-as', package, 'cat', completed['path']])
        (out / 'result.json').write_text(raw)
    report = json.loads((out / 'result.json').read_text())
    if report['runId'] != args.run_id:
        raise RuntimeError('Rebuild with matching RUN_ID; this result is not accepted')
    print(json.dumps({'output': str(out), 'blocks': completed['blocks']}))
finally:
    if args.platform == 'ios':
        partial = container / 'tmp' / f'patchmap-{args.run_id}.jsonl'
        if partial.exists():
            shutil.copy2(partial, out / 'blocks.jsonl')
    proc.terminate()
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()
    log.close()
    state('after')
    if args.platform == 'ios':
        call(['xcrun', 'simctl', 'terminate', args.device, package], False)
    else:
        call([adb, '-s', args.device, 'shell', 'am', 'force-stop', package], False)
