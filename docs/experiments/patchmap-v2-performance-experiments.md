# Patchmap V2 Performance Experiments

이 문서는 `rewrite/patchmap-v2-engine` 브랜치에서 진행한 patch-map 성능/렌더링 실험을 세션 대화, 커밋 히스토리, 로컬 `.gstack/benchmark-reports` 리포트, 현재 문서 기준으로 정리한 것이다.

숫자는 대부분 로컬 단일 실행 결과다. 절대 FPS는 실행 모드, 브라우저 프로세스 상태, CPU throttle, headed/headless 여부에 따라 흔들리므로 같은 리포트 안의 상대 비교를 우선한다. 렌더링이 깨지거나 patch-service 사용 계약을 깨는 변경은 성능 수치가 좋아도 채택하지 않았다.

## Documentation Review

이 문서는 새 세션에서 v2 실험 흐름을 다시 파악할 수 있도록 다음 출처를 함께 묶었다.

- `rewrite/patchmap-v2-engine` 커밋 히스토리
- perf 브랜치에서 v2로 분기된 reflog 흐름
- `.gstack/benchmark-reports`의 frame benchmark JSON/MD 리포트
- `docs/features/*` 공식 기능 계약 문서
- `docs/architecture/cleanroom-renderer.md`
- 데모/시각 확인 과정에서 발견한 렌더 parity 이슈

검토 결과, v2 쪽에서 실제로 채택된 구조 변경, 되돌린 PoC, benchmark 숫자, 남은 병목은 모두 이 문서 안에서 추적 가능하다. 다만 일부 대화 중 PoC는 커밋 없이 즉시 revert되어 정확한 diff가 남지 않았다. 그런 항목은 "benchmark-backed production patch 없음", "유지된 커밋 없음", "즉시 revert"로 표시했다. 이 표기는 누락이 아니라 확인 가능한 영속 기록이 없다는 뜻이다.

## 목표

- `draw`, `update`, selector, fit/focus, transformer, stateManager, patch-service selector path/update shape를 유지한다.
- 기존 Pixi displayObject를 임의로 만지는 비공식 사용보다 라이브러리의 공식 기능 계약을 우선한다.
- 대용량 patch-service 데이터에서 화면이 60fps에 가깝게 유지되는지 headless/headed 브라우저로 측정한다.
- 전체 패널 bar 높이 변경, 휠 pan, ctrl+wheel zoom, transformer 선택, shift+drag 멀티 선택 같은 실제 사용자 인터랙션을 벤치 시나리오로 고정한다.
- 성능 개선은 렌더 일치, 애니메이션, padding, rounded background/bar, alpha, 관계선 레이어 순서, 회전 객체 배치를 깨지 않아야 한다.

## 기준 데이터와 벤치 환경

- 데이터: `.gstack/benchmark-harness/patch-service-plant-map-data.json`
- 최신 리포트 기준 데이터 크기:
  - top-level items: 458
  - raw JSON objects: 12,184
  - raw JSON arrays: 579
  - panel items: 9,336
  - all items: 9,365
  - JSON size: 795,005 bytes
- 주요 실행 명령:
  - `node .gstack/benchmark-harness/run-patchmap-frame-benchmark.mjs`
  - `PATCHMAP_BENCH_CPU_THROTTLE=4 node .gstack/benchmark-harness/run-patchmap-frame-benchmark.mjs`
  - headed 확인은 benchmark harness/demo HTML을 dev server로 열어 확인했다.
- 측정 지표:
  - average FPS
  - p95 frame ms
  - max frame ms
  - long task count
  - action duration / update sync time
- headed 시각 확인용 FPS overlay는 추가했지만, 계측 오염을 피하기 위해 benchmark 측정에서는 기본적으로 꺼둔다.

## 고정한 시나리오

| 시나리오 | 목적 |
| --- | --- |
| `idle baseline after draw` | 최초 draw 이후 정지 상태 프레임 안정성 |
| `draw: redraw same data with fit` | 같은 대용량 데이터를 다시 draw하고 fit 수행 |
| `draw+update: all panel animated bar heights` | draw 후 전체 panel bar 높이 animated update |
| `update: all panel animated bar heights every 1s x10` | 전체 panel bar 높이 변경을 반복 입력했을 때 누적 부하 |
| `interaction: wheel canvas pan for 120 frames` | 휠 기반 캔버스 이동 |
| `interaction: ctrl wheel zoom in/out for 120 frames` | ctrl+wheel 기반 zoom in/out |
| `interaction: transformer single object select` | transformer가 켜진 객체 단일 선택 |
| `interaction: shift drag multi select` | shift+drag 멀티 선택 |
| `update: panel mixed state burst` | panel show/alpha/size가 섞인 burst update |
| `update: panel chart stream for 120 frames` | patch-service 쪽 chart 값이 계속 들어오는 stream update |
| `update: highlight bulk alpha burst` | highlight/alpha가 대량으로 바뀌는 update |
| `update: relations visibility by path` | 관계선 visibility/path update |
| `update: report panel backgrounds burst` | report panel background 변경 burst |

별도 데모도 만들었다.

- `.gstack/benchmark-harness/patchmap-panel-height-demo.html`
- 버튼:
  - 전체 패널 bar height 1회 변경
  - 전체 패널 bar height 10회 변경
- 10회 입력 간격: 200ms
- bar animation 기본값: 200ms
- 데모에서 padding 적용 여부, background 내부 bar 위치, rounded corner, 애니메이션 유무를 눈으로 확인했다.

## 공식 기능 고정

클린룸 재설계 전에 공식 기능을 문서로 고정했다.

| 문서 | 내용 |
| --- | --- |
| `docs/features/public-api.md` | 공개 API 범위 |
| `docs/features/data-schema.md` | data/model schema |
| `docs/features/draw-update-selector.md` | draw/update/selector 계약 |
| `docs/features/rendering-semantics.md` | background/bar/relation/text/icon 렌더 의미 |
| `docs/features/interaction-state-transformer.md` | interaction, selection, transformer, state 계약 |
| `docs/features/patch-service-compatibility.md` | patch-service 사용 형태 호환 |
| `docs/features/performance-contracts.md` | 벤치 시나리오와 성능 목표 |
| `docs/features/non-goals.md` | Pixi native 무제한 노출 등 비목표 |
| `docs/architecture/cleanroom-renderer.md` | cleanroom renderer 구조 |

핵심 설계 방향은 `public API -> normalized model -> indexes -> render IR diff -> feature renderers -> scheduled GPU/scene updates`다. Pixi scene graph를 사용자가 직접 만질 수 있다는 가능성은 공식 목표에서 낮추고, patch-map이 제공하는 기능 계약과 patch-service adapter behavior를 우선했다.

## 채택된 구조 변경

| 커밋 | 변경 | 결과 |
| --- | --- | --- |
| `833ab7a` | cleanroom feature contracts 문서화 | 전면 개편 전 기능 고정 기준 생성 |
| `8cf4930` | patch-service aggregate bar stream 계약 테스트 | patch-service 쪽 update shape와 aggregate stream을 테스트로 고정 |
| `63be7a6`, `a595312` | logical scene index, selector routing | Pixi scene graph 탐색 의존을 줄이고 logical id/path 기반으로 조회 |
| `75136da`, `2fa839a` | engine core, render scheduler scaffold | model/render diff/scheduler 기반 v2 구조 시작 |
| `e1efa87`, `281d203` | Pixi renderer와 opt-in v2 mode | 기존 구현과 비교 가능한 v2 경로 확보 |
| `9c298c4` | v2 panel layer aggregate | panel background/bar 계열의 object 수 절감 |
| `b63c79f`, `74cf71c` | compatibility refs, interaction index | selector/transformer/focus 등 기존 API 호환 유지 |
| `f510609`, `529c10d`, `e98e208`, `254472d`, `f314556`, `d5114e5` | silent update batch, fast path, incremental flush, merge overhead 절감, frame-budget queue, latest-state coalescing | 전체 update를 한 프레임에 몰아 UI가 멈추는 문제를 줄임 |
| `485dbc8` | v2 engine implementation 승격 | opt-in 성격을 제거하고 새 엔진을 주 구현으로 승격 |
| `8aec629` | unchanged redraw render skip | 같은 데이터 redraw에서 불필요한 render 감소 |
| `82f0e7e` | visual rendering 복구 | 클린룸 전환 후 깨진 rounded/background/bar 시각 복구 |
| `ca99285` | aggregate policy 반영 render plan refresh | icon/text show 상태 변화 시 aggregate fallback/refresh가 맞게 동작하도록 보정 |
| `17da35c` | aggregate rect layers with atlas particles | background/bar aggregate layer를 atlas particle 기반으로 확장 |
| `6f65fb3` | aggregate particle animation writes 감소 | aggregate animation 중 particle write 부하 감소 |
| `1caba65` | rotated component layout 정렬 | 회전된 item 안의 bar/component가 parent-local 좌표계에 맞게 배치되도록 수정 |

## Aggregate bar 정책

초기 조건은 다음 형태처럼 icon/text가 명시적으로 hidden인 patch-service panel에서만 aggregate bar를 썼다.

```js
[
  { type: 'bar', ... },
  { type: 'icon', show: false },
  { type: 'text', show: false },
]
```

이후 조건을 넓혀 "실제로 보이는 구조가 background와 bar만 있는 경우" aggregate bar를 사용하도록 바꿨다. 이유는 icon/text 객체가 데이터에 존재하더라도 `show: false`이면 렌더 결과는 bar-only와 같기 때문이다.

중요한 fallback:

- icon/text가 다시 show되면 aggregate path만 유지하면 안 된다.
- render plan refresh로 일반 component render path로 돌아가야 한다.
- aggregate로 렌더할 때 일반 bar displayObject는 Pixi 객체 호환을 위해 남아 있을 수 있지만, 실제 렌더는 `renderable = false`로 숨기고 aggregate layer가 담당한다.

## Queue / batching 설계

대량 `emit: false` update를 즉시 모두 적용하면 화면이 멈춘다. 그래서 현재는 다음 조합을 채택했다.

- latest-state queue
- per-frame budget
- coalescing
- explicit flush가 필요한 API는 queue를 비우고 최신 렌더를 보장

현재 코드 기준 update queue는 frame budget 4ms, 최대 750 update/frame으로 처리한다. 같은 target components update는 queue 안에서 최신 상태로 병합한다. 이 때문에 "전체 패널 한번 변경"이 데모에서 수백 ms 걸리는 것처럼 보일 수 있는데, 의도는 한 프레임에 모든 일을 밀어 넣지 않고 유저 입력/렌더링 여유를 남기는 것이다.

실험상 batching을 제거하거나 무작정 크게 풀면 UI가 멈추는 현상이 있었다. 따라서 최신 상태 coalescing + per-frame budget은 현재 설계에서 유지하는 쪽이 낫다.

## 최신 단일 리포트

리포트: `.gstack/benchmark-reports/2026-05-14T08-55-53-441Z-patchmap-frame-benchmark.json`

- CPU throttle: 1
- Headless Chrome
- Viewport: benchmark default
- 기준 frame budget: 16.667ms
- Head: `1caba65`

| 시나리오 | FPS | p95 ms | max ms | long tasks |
| --- | ---: | ---: | ---: | ---: |
| idle baseline | 59.99 | 17.1 | 17.7 | 1 |
| draw redraw+fit | 56.51 | 17.1 | 100.0 | 1 |
| draw+update all bars | 55.54 | 17.6 | 166.7 | 2 |
| all bars x10 | 58.10 | 17.5 | 34.1 | 0 |
| wheel pan | 60.00 | 17.0 | 17.7 | 0 |
| ctrl+wheel zoom | 59.99 | 17.1 | 17.7 | 0 |
| transformer select | 60.03 | 17.3 | 17.7 | 0 |
| shift drag multi select | 59.98 | 17.3 | 17.6 | 0 |
| mixed state burst | 48.90 | 33.5 | 49.9 | 1 |
| chart stream | 46.35 | 33.4 | 34.2 | 0 |
| highlight alpha burst | 37.31 | 17.6 | 516.7 | 2 |
| relations visibility | 60.00 | 17.5 | 17.7 | 0 |
| report backgrounds burst | 53.40 | 33.4 | 66.7 | 1 |

해석:

- pan, zoom, transformer, shift-drag, relation update는 현재 60fps 근처다.
- all bars x10은 latest-state/coalescing 적용 후 최신 리포트에서 long task 0으로 안정적이다.
- chart stream, highlight alpha, mixed burst, background burst는 아직 병목이 남아 있다.
- highlight alpha는 평균 FPS보다 max frame spike가 문제다.

## 3-way isolated 비교

리포트: `.gstack/benchmark-reports/2026-05-14T06-39-39-163Z-patchmap-3way-frame-benchmark-isolated.json`

- mode: `scenario-isolated`
- CPU throttle: 1
- viewport: 1440x900
- 같은 리포트 안에서 `rewrite/v2`, `perf branch`, `npm 0.9.1`을 비교했다.
- 이 모드는 절대 FPS가 낮게 나왔으므로 상대 비교만 본다.

| 시나리오 | v2 FPS | perf branch FPS | 0.9.1 FPS | v2 vs perf | v2 vs 0.9.1 |
| --- | ---: | ---: | ---: | ---: | ---: |
| idle baseline | 6.17 | 5.36 | 4.75 | +15.1% | +29.9% |
| draw redraw+fit | 6.77 | 5.15 | 4.61 | +31.5% | +46.9% |
| draw+update all bars | 4.71 | 4.35 | 3.31 | +8.3% | +42.3% |
| all bars x10 | 4.00 | 4.32 | 3.43 | -7.4% | +16.6% |
| wheel pan | 5.05 | 5.39 | 4.46 | -6.3% | +13.2% |
| ctrl+wheel zoom | 5.99 | 5.81 | 5.89 | +3.1% | +1.7% |
| transformer select | 5.32 | 4.21 | 4.73 | +26.4% | +12.5% |
| shift drag multi select | 5.55 | 5.11 | 4.92 | +8.6% | +12.8% |
| mixed state burst | 3.75 | 3.65 | 3.05 | +2.7% | +23.0% |
| chart stream | 3.60 | 3.66 | 3.46 | -1.6% | +4.0% |
| highlight alpha burst | 5.91 | 5.34 | 5.15 | +10.7% | +14.8% |
| relations visibility | 6.49 | 5.61 | 6.18 | +15.7% | +5.0% |
| report backgrounds burst | 5.80 | 5.41 | 5.60 | +7.2% | +3.6% |

해석:

- v2는 0.9.1 대비 모든 항목에서 개선됐다.
- perf branch 대비로는 대부분 개선됐지만 `all bars x10`, `wheel pan`, `chart stream`은 perf branch가 조금 나았다.
- 이후 최신 단일 리포트에서는 `all bars x10`이 58.10fps/long task 0까지 개선됐다.

## Atlas layer 단계별 리포트

Background atlas 적용 후:

리포트: `.gstack/benchmark-reports/2026-05-14T07-15-12-810Z-patchmap-v2-after-bg-atlas-isolated.json`

| 시나리오 | FPS | p95 ms |
| --- | ---: | ---: |
| idle baseline | 14.34 | 83.4 |
| draw redraw+fit | 11.85 | 116.7 |
| draw+update all bars | 6.02 | 249.9 |
| all bars x10 | 4.66 | 267.2 |
| wheel pan | 9.02 | 133.4 |
| ctrl+wheel zoom | 9.94 | 116.7 |
| transformer select | 8.91 | 133.4 |
| shift drag multi select | 8.22 | 134.4 |
| mixed state burst | 4.88 | 283.3 |
| chart stream | 5.46 | 217.3 |
| highlight alpha burst | 11.15 | 116.7 |
| relations visibility | 14.06 | 83.7 |
| report backgrounds burst | 11.19 | 100.3 |

Background + bar atlas 적용 후:

리포트: `.gstack/benchmark-reports/2026-05-14T07-23-26-054Z-patchmap-v2-after-bg-bar-atlas-isolated.json`

| 시나리오 | FPS | p95 ms |
| --- | ---: | ---: |
| idle baseline | 10.14 | 116.6 |
| draw redraw+fit | 9.88 | 116.8 |
| draw+update all bars | 7.22 | 166.8 |
| all bars x10 | 7.10 | 183.3 |
| wheel pan | 11.78 | 100.1 |
| ctrl+wheel zoom | 12.63 | 100.0 |
| transformer select | 11.39 | 133.3 |
| shift drag multi select | 10.39 | 215.7 |
| mixed state burst | 7.01 | 182.9 |
| chart stream | 9.01 | 134.3 |
| highlight alpha burst | 12.73 | 100.0 |
| relations visibility | 15.48 | 83.4 |
| report backgrounds burst | 9.78 | 117.0 |

해석:

- bar atlas까지 추가한 뒤 draw/update, pan/zoom, chart stream, highlight alpha는 개선됐다.
- idle/draw 일부는 background-only atlas 리포트보다 낮아졌지만, 핵심 update/interaction 병목에는 도움이 됐다.
- 이후 일반 frame benchmark에서는 60fps에 가까운 항목이 늘어났다.

## 반려한 실험

성능이 일부 좋아도 렌더 parity나 다른 시나리오가 깨지면 되돌렸다. 아래 실험들은 기록용 커밋 또는 로컬 PoC 후 revert됐다.

| 실험 | 변경 | 측정/결과 | 결정 |
| --- | --- | --- | --- |
| flat aggregate bar particle | aggregate bar texture를 실제 rounded/nine-slice texture 대신 `Texture.WHITE`와 tint로 대체 | 커밋 `1bb7baa` 후 `ae1c2b3`로 revert. 안정 리포트는 커밋에 남지 않음 | rounded bar 시각 계약과 이후 시나리오 안정성 리스크로 유지하지 않음 |
| aggregate bar viewport culling | viewport bounds와 margin을 기준으로 aggregate particle children을 다시 구성 | 커밋 `bf2f6f1` 후 `27b4c36`로 revert. `performance-contracts.md`에 "particleChildren 재구성 비용이 절감보다 큼"으로 기록 | pan/zoom 중 culling 재구성 비용이 커서 반려 |
| aggregate bar alpha fast path | root cached bar만 빠르게 alpha sync하고 subtree 탐색을 줄임 | 커밋 `a76cfcf` 후 `ee1e448`로 revert | 제한적 개선 또는 계약 리스크 대비 이득 부족 |
| CPU mesh aggregate bars | aggregate panel bar particles를 CPU-updated Pixi Mesh로 대체, rounded/nine-slice 유지 | `draw+update` +10.9%, `all bars x10` +53.6%, `wheel` +84.7%, `ctrl zoom` +29.5%. 반면 `chart stream` -16.6%, `highlight alpha` -32.7% | bulk/pan은 좋았지만 chart/alpha 회귀가 커서 반려 |
| custom mesh no slice | radius/nine-slice 없이 flat quad mesh로 단순화 | `all bars x10` +15.6%, `wheel` +19.9%, `ctrl zoom` +8.0%. 반면 `draw+update` -6.1%, `chart stream` -28.5%, `highlight alpha` -47.3% | radius 제거만으로는 전체 개선이 아니고 시각 계약도 약화되어 반려 |
| GPU animation mesh bars | shader/uniform time과 per-bar from/to/timing attribute로 GPU-side animation | `all bars x10` +7.1%. 반면 `draw+update` -18.6%, `wheel` -35.3%, `highlight alpha` -73.4% | attribute/shader overhead가 커서 반려 |
| packed-color CPU mesh bars | CPU mesh에서 color를 packed `unorm8x4`로 넣고 6-piece borderless layout 사용 | `all bars x10` +8.5%, `shift drag` +8.7%. 반면 `draw+update` -26.7%, `ctrl zoom` -50.6%, `mixed` -30.7% | 대다수 시나리오 회귀로 반려 |
| conditional bulk bar mesh overlay | 현재 v2 위에서 bulk bar animation 전용 Mesh overlay를 조건부로 적용 | 기준 리포트 대비 `draw+update` -17.4%, `all bars x10` -36.1%, `chart stream` -70.7%, `highlight alpha` -59.8% | 즉시 revert |
| queue head pointer | `_updateQueue.shift()`를 head pointer/compact 방식으로 바꿔 shift 비용 제거 시도 | 기준 리포트 대비 `all bars x10` -30.6%, `chart stream` -49.2%, `highlight` -66.7%, `backgrounds` -61.9% | 미세 자료구조 변경보다 scheduling side effect가 커서 revert |
| single element update target fast path | 단일 `opts.elements` update에서 target resolve를 더 빠르게 하는 경로 추가 | `all bars x10` 약 -44.8%, `chart stream` 약 -75.2%, `highlight` 약 -72.8%, `backgrounds` 약 -60.9% | revert |
| OffscreenCanvas/WebWorker | Pixi environment 후보로 검토 | patch-map update/interaction/viewport/selection이 DOM/Pixi scene graph/main-thread state와 강하게 묶여 있고, 현재 병목은 renderer policy/update coalescing 쪽이었다 | benchmark-backed production patch 없음 |
| bar spritesheet quantization | 5%/1% 단위 bar height texture/spritesheet 후보 검토 | aggregate atlas particle path가 더 직접적인 대안이었고, quantization은 animation fidelity와 texture churn 리스크가 있음 | 유지된 커밋 없음 |

## Mesh 실험에서 얻은 결론

Custom mesh는 객체 수를 줄일 수 있어서 대량 bulk update 일부에는 효과가 있었다. 하지만 현재 기능 범위 전체를 놓고 보면 다음 문제가 반복됐다.

- chart stream, alpha burst처럼 작은 update가 자주 들어오는 시나리오에서 vertex/attribute 갱신 비용이 커졌다.
- rounded/nine-slice를 정확히 유지하려면 mesh geometry가 복잡해져 단순 quad 장점이 줄었다.
- GPU-side animation은 CPU tween 제거 효과보다 attribute upload/shader path 비용이 더 컸다.
- radius를 없애면 일부 bulk 시나리오는 좋아지지만, 렌더 계약과 chart/alpha 시나리오가 나빠졌다.

따라서 현재 branch에서는 mesh 전면 대체보다 atlas particle aggregate + render plan/coalescing/scheduler 개선을 채택했다.

## 렌더 parity 이슈와 수정

| 이슈 | 증상 | 처리 |
| --- | --- | --- |
| v2 초기 render 깨짐 | demo에서 background/bar가 이미지처럼 나오지 않고 padding/rounded가 맞지 않음 | visual renderer 복구, padding 적용, bar가 background 내부에 들어가도록 수정 |
| animation 사라짐 | 전체 panel height 변경 시 bar가 즉시 바뀌거나 움직임이 보이지 않음 | aggregate bar animation 복구, 기본 animationDuration 200ms |
| rounded corner 찌그러짐 | bar/background radius가 특정 크기에서 찌그러짐 | nine-slice particle/atlas layer로 corner 보존 |
| alpha 미적용처럼 보임 | aggregate path에서 alpha 변화가 일반 renderer와 달라 보임 | alpha sync 경로 확인 및 aggregate appearance 적용 |
| relation layer 순서 | relation이 background보다 위, bar보다 아래에 끼는 상태 확인 | render order/layer 정책 점검 |
| repeated 10x update | queue가 끝날 때까지 마지막에 한 번만 적용되는 것처럼 보임 | latest-state coalescing 의도와 UI freeze tradeoff 검토, per-frame budget 유지 |
| height 변경 중 bar 떨림 | bar 위치가 흔들리는 것처럼 보임 | animation/placement 계산 점검 |
| rotated object | 회전된 item 안 component가 parent-local 회전을 따르지 않음 | `1caba65`에서 수정. 90도 회전 item의 bar 위치 smoke test 통과 |

## 회전 수정 전후 확인

비교 리포트:

- 이전: `.gstack/benchmark-reports/2026-05-14T08-57-03-020Z-patchmap-frame-benchmark.json`
- 이후: `.gstack/benchmark-reports/2026-05-14T08-55-53-441Z-patchmap-frame-benchmark.json`

| 시나리오 | 이전 FPS | 이후 FPS | 이전 p95 | 이후 p95 | 판단 |
| --- | ---: | ---: | ---: | ---: | --- |
| draw redraw+fit | 57.64 | 56.51 | 17.4 | 17.1 | 노이즈 수준 |
| draw+update all bars | 57.83 | 55.54 | 17.2 | 17.6 | 소폭 하락이나 허용 범위 |
| all bars x10 | 57.28 | 58.10 | 17.7 | 17.5 | 개선 |
| chart stream | 32.12 | 46.35 | 50.2 | 33.4 | 개선 |
| highlight alpha burst | 31.63 | 37.31 | 33.3 | 17.6 | 개선 |
| report backgrounds burst | 44.43 | 53.40 | 50.1 | 33.4 | 개선 |

회전 대응으로 인한 의미 있는 성능 저하는 확인되지 않았다.

## 현재 남은 병목

최신 리포트 기준 완전히 해결되지 않은 항목은 다음이다.

- `update: panel chart stream for 120 frames`
  - 46.35fps, p95 33.4ms
  - 작은 update가 매 프레임 들어오는 stream에서 render/update overhead가 남아 있다.
- `update: highlight bulk alpha burst`
  - 37.31fps, max 516.7ms
  - 평균보다 spike가 문제다.
- `update: panel mixed state burst`
  - 48.90fps, p95 33.5ms
  - show/alpha/size 혼합 변경에서 render plan refresh 비용이 남아 있다.
- `update: report panel backgrounds burst`
  - 53.40fps, p95 33.4ms
  - background aggregate layer는 개선됐지만 burst 시 완전 60fps는 아니다.

## 최종 판단

이 브랜치에서 효과가 있어 남긴 전략은 다음이다.

- 공식 기능 계약을 먼저 문서화하고, Pixi native 무제한 호환보다 patch-map 공식 기능과 patch-service adapter behavior를 우선한 것
- logical model/index/render IR 중심으로 scene graph 탐색을 줄인 것
- background/bar 계열을 aggregate atlas particle layer로 렌더해 top-level object 수와 일반 displayObject update를 줄인 것
- latest-state queue, coalescing, per-frame budget으로 대량 update가 UI를 멈추지 않게 한 것
- 일반 bar displayObject는 compatibility ref로 유지하되 실제 bar-only 렌더는 aggregate layer가 담당하게 한 것
- 렌더 parity가 깨진 변경은 수치가 좋아도 반려한 것

효과가 없거나 유지하지 않은 전략은 다음이다.

- custom mesh 전면 대체
- GPU-side animation mesh
- radius 없는 flat bar
- naive viewport culling
- OffscreenCanvas/WebWorker 전환
- bar height spritesheet quantization
- queue 자료구조 미세 최적화
- 단일 update target fast path

현재 구조가 이론적으로 가능한 최종 최적해라고 보기는 어렵다. 다만 이번 실험 범위에서는 "mesh/shader로 더 낮은 레이어를 직접 짜는 방식"보다 "공식 기능을 좁히고, model/index/render policy/scheduler/aggregate atlas layer를 정리하는 방식"이 더 안정적으로 성능과 렌더 일치를 동시에 만족했다.

다음 후보가 있다면 chart stream과 highlight alpha spike를 따로 잡아야 한다. 이미 좋은 bulk update 수치를 더 밀기보다, 작은 반복 update와 alpha-only update가 render plan 전체를 건드리지 않도록 더 세밀한 dirty bit/index를 도입하는 쪽이 우선순위가 높다.
