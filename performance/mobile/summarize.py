#!/usr/bin/env python3
"""Summarize raw within-platform paired blocks; never merge devices/build modes."""
import json
import math
from pathlib import Path
import statistics
import sys

METRICS = ['updateMs', 'updateAndVerticesMs', 'postFrameMs', 'buildMs', 'rasterMs', 'totalSpanMs']


def validate(report):
    """Only complete, correct protocol-v1 runs may produce speed rankings."""
    if report.get('protocol') != 1:
        raise ValueError('Unsupported benchmark protocol')
    transports = {block['transport'] for block in report['blocks']}
    if len(transports) != 2 or 'json' not in transports:
        raise ValueError('Expected JSON and one package-specific transport')
    expected = {(count, stride, transport, variant, block)
                for count in (5000, 10000) for stride in (1, 10)
                for transport in transports for variant in ('dart', report['runtime'])
                for block in range(6)}
    seen = set()
    frames = set()
    for block in report['blocks']:
        key = tuple(block[name] for name in ('count', 'stride', 'transport', 'variant', 'block'))
        if key not in expected or key in seen:
            raise ValueError(f'Unexpected or duplicate block: {key}')
        seen.add(key)
        samples = block['samples']
        if block.get('correctness') is not True or block.get('timingCoverage') != 40 or len(samples) != 40:
            raise ValueError(f'Correctness or timing coverage failure: {key}')
        for index, sample in enumerate(samples):
            if sample.get('sample') != index or sample.get('warmup') is not (index < 10):
                raise ValueError(f'Invalid sample order/warmup: {key}, {index}')
            frame = sample.get('frameNumber')
            if frame is None or frame in frames:
                raise ValueError(f'Missing or reused frame: {key}, {index}')
            frames.add(frame)
            for metric in METRICS:
                value = sample.get(metric)
                if not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
                    raise ValueError(f'Invalid {metric}: {key}, {index}')
    if seen != expected:
        raise ValueError(f'Incomplete run: {len(seen)}/{len(expected)} blocks')


def percentile(values, fraction):
    ordered = sorted(values)
    index = (len(ordered) - 1) * fraction
    lo = int(index)
    hi = min(lo + 1, len(ordered) - 1)
    return ordered[lo] + (ordered[hi] - ordered[lo]) * (index - lo)

def summarize(name):
    path = Path(name)
    report = json.loads(path.read_text())
    manifest_path = path.with_name('manifest.json')
    if not manifest_path.is_file():
        raise ValueError('Missing build manifest')
    manifest = json.loads(manifest_path.read_text())
    if report['runtime'] != f"{manifest['runtime']}-{manifest['version']}":
        raise ValueError('Runtime does not match build manifest')
    if manifest['runtime'] in ('jsf', 'quickjs_engine'):
        if manifest.get('nativeBuildPolicy') != 'source-O3-NDEBUG':
            raise ValueError('Unoptimized native engine run is diagnostic only, not a normalized ranking')
        for evidence in ('android-native-compile-commands.json', 'ios-native-build-settings.json'):
            if not path.with_name(evidence).exists():
                raise ValueError(f'Missing native compiler evidence: {evidence}')
    if manifest['runtime'] == 'quickjs_engine' and report['os'] == 'ios':
        if manifest.get('iosIntegration') != 'explicit-published-native-sources' or not path.with_name('ios-native-exports.json').exists():
            raise ValueError('Missing iOS integration/export qualification')
    validate(report)
    groups = {}
    for block in report['blocks']:
        key = (block['count'], block['stride'], block['transport'])
        groups.setdefault(key, []).append(block)
    summaries = []
    for (count, stride, transport), blocks in groups.items():
        variants = sorted({block['variant'] for block in blocks})
        for metric in METRICS:
            row = {'count': count, 'stride': stride, 'transport': transport, 'metric': metric, 'variants': {}}
            medians = {}
            for variant in variants:
                selected = [b for b in blocks if b['variant'] == variant]
                samples = [s[metric] for b in selected for s in b['samples'] if not s['warmup'] and metric in s]
                by_block = {b['block']: statistics.median([s[metric] for s in b['samples'] if not s['warmup'] and metric in s])
                            for b in selected if any(not s['warmup'] and metric in s for s in b['samples'])}
                medians[variant] = by_block
                if not samples:
                    continue
                row['variants'][variant] = {'n': len(samples), 'medianMs': statistics.median(samples),
                    'p95Ms': percentile(samples, .95), 'maxMs': max(samples),
                    'over16_67Ms': sum(s > 16.67 for s in samples),
                    'overDeviceBudget': sum(s > 1000 / (report.get('refreshRate') or 60) for s in samples),
                    'deviceBudgetMs': 1000 / (report.get('refreshRate') or 60), 'blockMediansMs': by_block}
            other = next((v for v in variants if v != 'dart'), None)
            if other and medians['dart'] and medians[other]:
                pairs = sorted(set(medians['dart']) & set(medians[other]))
                deltas = [medians[other][i] - medians['dart'][i] for i in pairs]
                delta = statistics.median(deltas)
                consistent = sum(d > 0 for d in deltas) >= 5 or sum(d < 0 for d in deltas) >= 5
                row['pairedJsMinusDartMedianMs'] = delta
                row['pairedDeltasMs'] = deltas
                row['classification'] = ('dart-faster' if delta > 0 else 'js-faster') if len(pairs) == 6 and consistent and abs(delta) > 2 else 'neutral-or-inconclusive'
            summaries.append(row)
    output = {'source': str(path), 'runId': report['runId'], 'os': report['os'], 'mode': report['mode'], 'runtime': report['runtime'], 'summaries': summaries}
    path.with_name('summary.json').write_text(json.dumps(output, indent=2))
    return output


if __name__ == '__main__':
    for name in sys.argv[1:]:
        print(json.dumps(summarize(name), indent=2))
