#!/usr/bin/env python3
"""Write a reviewable report and flat CSV from fully validated mobile runs."""
import argparse
import csv
import json
from pathlib import Path

from summarize import summarize

parser = argparse.ArgumentParser()
parser.add_argument('results', nargs='+', type=Path)
parser.add_argument('--out', type=Path, default=Path('.artifacts/performance/mobile'))
args = parser.parse_args()
args.out.mkdir(parents=True, exist_ok=True)
reports = []
flat = []
core_identity = None
platform_identity = {}
seen_candidates = set()
for path in args.results:
    summary = summarize(path)
    raw = json.loads(path.read_text())
    manifest = json.loads(path.with_name('manifest.json').read_text())
    identity = tuple(manifest['harnessHashes'][key] for key in
                     ('kernel.ts', 'lib/main.dart', 'lib/geometry.dart')) + (manifest['sourceFileSha256'],)
    if core_identity is not None and identity != core_identity:
        raise ValueError('Input/geometry/frame harness differs across candidates')
    core_identity = identity
    surface = (raw['mode'], raw['osVersion'], tuple(raw['physicalSize']), raw['dpr'],
               tuple(raw['viewport']), round(raw['refreshRate'], 2))
    if raw['os'] in platform_identity and platform_identity[raw['os']] != surface:
        raise ValueError('Surface or build mode differs within one platform')
    platform_identity[raw['os']] = surface
    candidate = (raw['os'], raw['runtime'])
    if candidate in seen_candidates:
        raise ValueError('Select one accepted attempt per platform/candidate; do not pool attempts')
    seen_candidates.add(candidate)
    reports.append((path.resolve(), summary, raw))
    for row in summary['summaries']:
        for variant, values in row['variants'].items():
            flat.append({
                'runId': summary['runId'], 'os': summary['os'], 'mode': summary['mode'],
                'runtime': summary['runtime'], 'count': row['count'], 'stride': row['stride'],
                'nativeBuildPolicy': manifest.get('nativeBuildPolicy', 'package-prebuilt-android/system-jsc-ios'),
                'iosIntegration': manifest.get('iosIntegration', 'stock-pod'),
                'transport': row['transport'], 'metric': row['metric'], 'variant': variant,
                **{key: value for key, value in values.items() if key != 'blockMediansMs'},
                'pairedJsMinusDartMedianMs': row.get('pairedJsMinusDartMedianMs'),
                'classification': row.get('classification'),
            })

with (args.out / 'comparison.csv').open('w', newline='') as file:
    writer = csv.DictWriter(file, fieldnames=list(flat[0]))
    writer.writeheader()
    writer.writerows(flat)

lines = [
    '# PatchMap 모바일 렌더링 비교 실험', '',
    'Android 에뮬레이터(profile)와 iOS 시뮬레이터(debug/JIT)를 각각 비교한다. '
    '플랫폼 간 점수를 합치거나 실기기 성능으로 해석하지 않는다.', '',
    '소스 빌드 JS 엔진(jsf/quickjs_engine)은 양쪽 플랫폼에서 `-O3`와 `NDEBUG`를 사용하고 '
    '실제 컴파일 설정을 검증했다. flutter_js Android는 패키지가 제공하는 바이너리, '
    'iOS는 시스템 JSC를 사용하므로 그 엔진의 컴파일 플래그를 동일하게 만들 수는 없다. '
    'Flutter profile이라는 이름만으로 native C 엔진의 최적화를 가정하지 않았다.', '',
    'iOS quickjs_engine 0.1.5는 기본 pod 구성에서 native 엔진 소스가 빠져 실행에 실패했다. '
    '해당 iOS 결과는 벤치마크 Podfile에서 배포된 C/C++ 파일을 명시적으로 포함하고 '
    'FFI 심볼 검증을 추가한 통합 보완을 포함한다. 엔진/geometry 소스는 수정하지 않았다.', '',
    '4×25 grid 50개/100개, 총 5,000개/10,000개 bar의 높이를 변경했다. '
    '전체 변경과 흩어진 10% 변경을 구분하며, 모든 대상 높이는 이전 값과 다르다. '
    '같은 입력과 Flutter Canvas 렌더러를 사용하고, JS는 기존 TypeScript의 '
    'rounded-bar geometry 함수를 직접 import한다. Dart는 해당 계산을 독립 구현한다.', '',
    '**범위:** 기존 npm 패키지 전체를 수정 없이 Flutter에 mount한 실험이 아니다. '
    'geometry 계산·전달·native vertex 준비와 frame을 측정한 결과다. '
    '전체 기능 동등성, Flame과 Canvas의 비교, JS 의미 처리 + Dart geometry 조합, '
    '콜드 스타트·지속 메모리·배터리·입력 지연은 이 실험으로 판정하지 않는다.', '',
    '각 case/전달 방식에서 Dart와 JS를 순서를 번갈아 6회 실행했다. '
    '블록마다 10회 warmup 후 30회 측정하므로 표의 각 변형은 180개 샘플이다. '
    '출력 일치와 96개 블록/3,840개 프레임 연결을 모두 검증한 실행만 포함한다. '
    '중앙값의 paired 차이가 2ms를 넘고 6개 중 5개 이상 같은 방향일 때만 우위를 표시한다.', '',
    '단위는 ms. `준비`는 계산 + JS/Dart 변환·복사 + 공통 렌더 vertex 준비이며 '
    '화면 표시 완료 시간이 아니다. `frame p95`는 Flutter FrameTiming.totalSpan이며 '
    '실제 픽셀 발광까지의 지연은 아니다. 상세 build/raster/postFrame 분포와 '
    '16.67ms 초과 수는 [CSV](comparison.csv)와 각 실행의 summary.json에 보존한다. '
    '표의 최종 판정은 준비 시간만으로 정하지 않고 totalSpan의 paired 블록 중앙값에 적용한다.', '',
    '`native-buffer`도 복사가 있다. flutter_js iOS 경로는 JSON 입력/바이너리 출력이다. '
    '`jsf arraybuffer-api`는 내부 tagged JSON 변환을 포함한다. '
    'JS 쪽에서 변경 bar의 전체 vertex를 전달하는 경계이므로 heights/명령만 전달하는 설계와 구분한다.', '',
    'JS는 기존 범용 geometry 함수의 transform/변경 탐지 분기도 실행한다. '
    'Dart는 이 축 정렬 fixture의 동등한 출력을 만드는 특화 구현이다. '
    '따라서 차이는 언어 자체뿐 아니라 구현 형태와 전달 경계를 포함한다. '
    '회전·projection·UV까지 동일한 일반 geometry 엔진의 비교로 확대하지 않는다.', '',
    '10,000개 전체 변경은 출력만 1,680,000 bytes(42 float32/bar)다. '
    '계산과 bridge를 합친 wall time을 측정했으므로 엔진 자체 실행 시간과 전달 비용의 '
    '정확한 비중은 분해하지 않는다. 패키지 이름의 비교는 해당 버전·binding·빌드·전달 경로의 비교다.', '',
]

for platform in ('android', 'ios'):
    selected = [entry for entry in reports if entry[1]['os'] == platform]
    if not selected:
        continue
    lines += [f'## {platform}', '']
    for stride in (1, 10):
        lines += [f'### {"전체" if stride == 1 else "10%"} 높이 변경', '',
                  '| JS 패키지 | bar 수 | 전달 | 준비 Dart 중앙값 / p95 | 준비 JS 중앙값 / p95 | frame paired JS−Dart | frame p95 Dart / JS | 프레임 기준 판정 |',
                  '| --- | ---: | --- | ---: | ---: | ---: | ---: | --- |']
        for _, summary, _ in selected:
            for row in summary['summaries']:
                if row['metric'] != 'updateAndVerticesMs' or row['stride'] != stride:
                    continue
                dart = row['variants']['dart']
                js = row['variants'][summary['runtime']]
                frame_row = next(r for r in summary['summaries'] if r['metric'] == 'totalSpanMs'
                             and (r['count'], r['stride'], r['transport']) ==
                             (row['count'], row['stride'], row['transport']))
                frame = frame_row['variants']
                verdict = {'dart-faster': 'Dart 우위', 'js-faster': 'JS 우위',
                           'neutral-or-inconclusive': '중립/미확정'}[frame_row['classification']]
                lines.append(f"| {summary['runtime']} | {row['count']:,} | {row['transport']} | "
                             f"{dart['medianMs']:.3f} / {dart['p95Ms']:.3f} | "
                             f"{js['medianMs']:.3f} / {js['p95Ms']:.3f} | "
                             f"{frame_row['pairedJsMinusDartMedianMs']:+.3f} | "
                             f"{frame['dart']['p95Ms']:.3f} / {frame[summary['runtime']]['p95Ms']:.3f} | {verdict} |")
        lines.append('')

lines += ['## 실행별 근거', '',
          '환경 로그의 열 경고와 외부 부하 여부는 별도로 검토한다. 시뮬레이터의 가상 배터리/열 상태는 '
          '호스트 상태를 대체하지 않는다. 패키지별 Dart 값은 해당 앱과 교차 실행한 기준값이며 '
          '다른 앱의 Dart 샘플을 합치지 않는다.', '']
for path, summary, raw in reports:
    lines += [f"- [{summary['runId']}]({path}): {summary['mode']}, "
              f"DPR {raw['dpr']}, {raw['refreshRate']:.2f} Hz, "
              f"{len(raw['blocks'])} blocks, "
              f"[source/dependency manifest]({path.with_name('manifest.json')}), "
              f"[before]({path.with_name('before-environment.json')}), "
              f"[after]({path.with_name('after-environment.json')})."]

notes = args.out / 'qualification.md'
if notes.exists():
    lines += ['', '## 재실행 및 제외 기록', '', notes.read_text().strip()]

(args.out / 'report.md').write_text('\n'.join(lines) + '\n')
print(args.out / 'report.md')
print(args.out / 'comparison.csv')
