"""Run/assemble the Android Canvas/Flame comparison without repeated installs.

Uses only Python's standard library. Install the pinned APK once before `run`.
The caller owns device settings and restores the regular demo after measurement.
"""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import re
import statistics
import subprocess
import time

ROOT = Path(__file__).resolve().parents[2]
PACKAGE = 'com.conalog.patch_map_example'


def matrix(suite='primary'):
    if suite == 'supplement':
        for block in range(2):
            for workload, view, variants in (
                ('cold-reentry', 'zoom', ('stock', 'canvas', 'flame')),
                ('animated', 'zoom', ('canvas', 'canvas-vector', 'flame', 'flame-vector', 'flame-raw')),
                ('fit-animated', 'fit', ('canvas', 'canvas-atlas', 'flame', 'flame-atlas', 'flame-raw')),
            ):
                for variant in variants if block == 0 else reversed(variants):
                    yield block, view, workload, variant
        return
    for block in range(2):
        for view in ('fit', 'zoom'):
            for workload in (('immediate', 'animated', 'text', 'text-cold') if suite == 'scale10k'
                             else ('immediate', 'animated', 'text', 'pan')):
                order = ('canvas', 'flame', 'flame-raw') if suite == 'scale10k' else ('stock', 'canvas', 'flame')
                for variant in order if block == 0 else reversed(order):
                    yield block, view, workload, variant


def validate(report, case_key, suite='primary'):
    block, view, workload, variant = case_key
    assert report['completed'] and report['mode'] == 'profile/AOT'
    if suite != 'supplement':
        assert report['fitAtlas'] is True
        assert report['filter'] == f'/{variant}/{block}/{view}/{workload}'
    else:
        assert report['hostQualitySkippedForIsolation'] is True
    assert len(report['cases']) == 1
    case = report['cases'][0]
    assert (case['block'], 'zoom' if case['zoom'] else 'fit',
            case['workload'], case['variant']) == case_key
    if suite == 'supplement' and variant == 'flame-raw':
        assert case['rendererConfig'] == dict(host='flame', flameBatch=False, atlasBars=True, minAtlasScale=0.0)
    if suite == 'scale10k':
        assert report['protocol'] == 'patch-map-canvas-flame/scale-10k-1'
        assert report['panelCount'] == 10000 and report['groupCount'] == 100
        assert report['seed'] == 0x5eed
        assert report['dpr'] > 0 and len(report['physicalSize']) == 2
        assert all(size > 0 for size in report['physicalSize'])
        assert case['rendererConfig'] == dict(
            host='canvas' if variant == 'canvas' else 'flame',
            flameBatch=variant == 'flame', atlasBars=True, minAtlasScale=0.0)
    count, warmups = (12, 2) if workload == 'cold-reentry' else (25, 5)
    assert case['completed'] and len(case['rows']) == count
    for index, row in enumerate(case['rows']):
        assert row['sample'] == index and row['warmup'] == (index < warmups)
        assert row['thermalAfter'] == 0 and row['frames']
        for key in ('commitMs', 'firstChangedMs', 'finalMs'):
            assert math.isfinite(row[key]) and row[key] >= 0
        for frame in row['frames']:
            assert frame['buildMs'] >= 0 and frame['rasterMs'] >= 0
            assert frame['vsyncUs'] > 0
    return case


def run(args):
    def adb(*command):
        return subprocess.check_output(
            [args.adb, '-s', args.device, *command], text=True).strip()

    digest = hashlib.sha256(args.apk.read_bytes()).hexdigest()
    installed = adb('shell', 'pm', 'path', PACKAGE).removeprefix('package:')
    assert '\n' not in installed and installed, 'Expected one installed APK'
    assert adb('shell', 'sha256sum', installed).split()[0] == digest
    manifest = json.loads(args.manifest.read_text())
    assert manifest['apkSha256'] == digest
    for name, expected in manifest['files'].items():
        assert hashlib.sha256((ROOT / name).read_bytes()).hexdigest() == expected, name
    args.output.mkdir(parents=True, exist_ok=True)
    receipt = args.output / 'sources.json'
    if receipt.exists():
        assert json.loads(receipt.read_text()) == manifest
    else:
        receipt.write_text(json.dumps(manifest, indent=2) + '\n')
    for case_key in matrix(args.suite):
        block, view, workload, variant = case_key
        tag = f'{block}-{view}-{workload}-{variant}'
        dest = args.output / f'{tag}.json'
        # Explicit resume accepts only independently complete, identical cases.
        if dest.exists() and args.resume:
            validate(json.loads(dest.read_text())['rendererComparison'], case_key, args.suite)
            origin = json.loads((args.output / f'{tag}-provenance.json').read_text())
            assert origin['apkSha256'] == digest and origin['brightness'] == 35
            assert origin['route'] == f'/{variant}/{block}/{view}/{workload}'
            continue
        assert not dest.exists(), f'Use a new output directory: {dest}'
        adb('shell', 'am', 'force-stop', PACKAGE)
        for attempt in range(36):
            thermal = adb('shell', 'dumpsys', 'thermalservice')
            status = int(re.search(r'Thermal Status: (\d+)', thermal)[1])
            live = thermal.split('Current temperatures from HAL:', 1)[1]
            skin = float(re.search(r'mValue=([\d.]+), mType=3, mName=SKIN', live)[1])
            if status == 0 and skin <= 35.5:
                break
            if attempt % 3 == 0:
                print(f'Cooling: status={status}, SKIN={skin}C', flush=True)
            time.sleep(5)
        else:
            raise TimeoutError('Starting thermal condition not reached in 180 seconds')
        assert adb('shell', 'settings', 'get', 'system', 'screen_brightness') == '35'
        (args.output / f'{tag}-start-thermal.txt').write_text(thermal)
        route = f'/{variant}/{block}/{view}/{workload}'
        adb('shell', 'am', 'start', '-a', 'android.intent.action.MAIN',
            '-c', 'android.intent.category.LAUNCHER', '-f', '0x20000000',
            '--ez', 'enable-dart-profiling', 'true', '--es', 'route', route,
            PACKAGE + '/.MainActivity')
        port = None
        try:
            for _ in range(100):
                result = subprocess.run([args.adb, '-s', args.device, 'shell',
                    'pidof', PACKAGE], text=True, capture_output=True)
                if result.returncode == 0 and result.stdout.strip():
                    pid = result.stdout.strip()
                    break
                time.sleep(.1)
            else:
                raise TimeoutError('App process did not start')
            for _ in range(100):
                log = adb('logcat', '-d', '--pid=' + pid, '-s', 'flutter:I')
                match = re.search(
                    r'The Dart VM service is listening on (http://127\.0\.0\.1:(\d+)/\S+)', log)
                if match:
                    break
                time.sleep(.1)
            else:
                raise TimeoutError('VM service did not start')
            port = adb('forward', 'tcp:0', 'tcp:' + match[2])
            url = match[1].replace(':' + match[2] + '/', ':' + port + '/')
            with (args.output / f'{tag}.log').open('w') as log_file:
                result = subprocess.run([
                    args.flutter, 'drive', '--profile', '--no-pub', '-d', args.device,
                    '--driver=test_driver/renderer_comparison_driver.dart',
                    '--target=integration_test/renderer_comparison' +
                    ('_supplement' if args.suite == 'supplement' else '') + '_test.dart',
                    '--use-existing-app=' + url,
                ], cwd=ROOT / 'packages/flutter/example',
                    env=dict(os.environ, PATCHMAP_COMPARISON_OUTPUT=str(dest)),
                    stdout=log_file, stderr=subprocess.STDOUT, timeout=360)
            (args.output / f'{tag}-device.log').write_text(adb('logcat', '-d', '--pid=' + pid))
            assert result.returncode == 0, f'Failed case: {tag}; preserve its evidence'
            validate(json.loads(dest.read_text())['rendererComparison'], case_key, args.suite)
            (args.output / f'{tag}-provenance.json').write_text(json.dumps({
                'apkSha256': digest, 'route': route, 'pid': pid,
                'process': 'fresh; installed APK reused', 'brightness': 35,
            }))
            print('QUALIFIED ' + tag, flush=True)
        finally:
            adb('shell', 'am', 'force-stop', PACKAGE)
            if port:
                adb('forward', '--remove', 'tcp:' + port)


def distribution(values):
    values = sorted(values)
    if not values:
        return None
    return dict(p50=statistics.median(values),
                p95=values[math.ceil(len(values) * .95) - 1], max=values[-1])


def assemble(args):
    cases, provenance = [], []
    metadata = None
    hashes = set()
    for key in matrix(args.suite):
        tag = '-'.join(map(str, key))
        path = args.output / f'{tag}.json'
        report = json.loads(path.read_text())['rendererComparison']
        cases.append(validate(report, key, args.suite))
        identity = {k: v for k, v in report.items() if k not in ('cases', 'filter')}
        if metadata is None:
            metadata = identity
        assert metadata == identity, f'Mixed report metadata: {path}'
        origin = json.loads((args.output / f'{tag}-provenance.json').read_text())
        block, view, workload, variant = key
        assert origin['route'] == f'/{variant}/{block}/{view}/{workload}'
        assert origin['brightness'] == 35
        hashes.add(origin['apkSha256'])
        provenance.append(origin)
    assert len(cases) == len(list(matrix(args.suite))) and len(hashes) == 1
    manifest = json.loads((args.output / 'sources.json').read_text())
    assert hashes == {manifest['apkSha256']}
    grouped = {}
    for case in cases:
        key = f"{case['variant']}/{'zoom' if case['zoom'] else 'fit'}/{case['workload']}"
        grouped.setdefault(key, []).append(case)
    summaries = {}
    for key, group in grouped.items():
        rows = [r for c in group for r in c['rows'] if not r['warmup']]
        frames = [f for r in rows for f in r['frames']]
        summaries[key] = {
            'firstWarmup': [{'block': c['block'], 'firstChangedMs': c['rows'][0]['firstChangedMs']} for c in group],
            'samples': len(rows),
            **{k: distribution(r[k] for r in rows)
               for k in ('commitMs', 'firstChangedMs', 'finalMs')},
            **{k: distribution(f[k] for f in frames) for k in ('buildMs', 'rasterMs')},
            'framesPerSample': distribution(len(r['frames']) for r in rows),
            'vsyncGapMs': distribution((b['vsyncUs'] - a['vsyncUs']) / 1000
                for r in rows for a, b in zip(r['frames'], r['frames'][1:])),
            'frameCount': len(frames),
            'uiOver60HzBudget': sum(f['buildMs'] > 1000 / 60 for f in frames),
            'rasterOver60HzBudget': sum(f['rasterMs'] > 1000 / 60 for f in frames),
            'blocks': [{
                'block': c['block'],
                'firstChangedMs': distribution(r['firstChangedMs'] for r in c['rows'] if not r['warmup']),
                'buildMs': distribution(f['buildMs'] for r in c['rows'] if not r['warmup'] for f in r['frames']),
                'rasterMs': distribution(f['rasterMs'] for r in c['rows'] if not r['warmup'] for f in r['frames']),
            } for c in group],
        }
        if 'precedingUpdate' in rows[0]:
            summaries[key]['precedingTextUpdate'] = {
                k: distribution(r['precedingUpdate'][k] for r in rows)
                for k in ('commitMs', 'firstChangedMs', 'finalMs')
            }
    (args.output / 'aggregate.json').write_text(json.dumps({
        'rendererComparison': dict(metadata, cases=cases),
        'processProtocol': 'one installed APK, one fresh process per case',
        'provenance': provenance, 'summary': summaries,
    }, indent=2) + '\n')
    warm = sum(r['warmup'] for c in cases for r in c['rows'])
    total = sum(len(c['rows']) for c in cases)
    print(f'Validated {len(cases)} unique cases, {warm} warmups and {total-warm} measured rows')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['run', 'assemble'])
    parser.add_argument('--output', type=lambda s: Path(s).resolve(), required=True)
    parser.add_argument('--suite', choices=['primary', 'supplement', 'scale10k'], default='primary')
    parser.add_argument('--device')
    parser.add_argument('--resume', action='store_true', help='Skip only verified complete cases with the same APK')
    parser.add_argument('--apk', type=lambda s: Path(s).resolve())
    parser.add_argument('--manifest', type=lambda s: Path(s).resolve())
    parser.add_argument('--adb', default='adb')
    parser.add_argument('--flutter', default='flutter')
    args = parser.parse_args()
    if args.command == 'run':
        if not all((args.device, args.apk, args.manifest)):
            parser.error('run requires --device, --apk and --manifest')
        run(args)
    else:
        assemble(args)
