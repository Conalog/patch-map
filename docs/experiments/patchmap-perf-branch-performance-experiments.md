# Patchmap Perf Branch Performance Experiments

이 문서는 `perf/patchmap-render-optimization` 브랜치에서 진행한 patch-map 성능 실험과 결과를 정리한 것이다. 목적은 `rewrite/patchmap-v2-engine` 실험 로그와 함께 실제 `main` 브랜치에 가져갈 개선 후보를 고르기 위한 근거를 남기는 것이다.

대상 브랜치는 `v0.9.1`에서 분기했다. 이후 v2 cleanroom 관련 문서/논리 인덱스 커밋이 잠시 이 브랜치에 올라갔지만, `198c5ad`로 reset되어 perf 브랜치 최종 상태에서는 제외됐다. v2로 옮겨진 항목은 `docs/experiments/patchmap-v2-performance-experiments.md`에서 다룬다.

## Documentation Review

이 문서는 새 세션에서 perf 브랜치 실험 흐름을 다시 파악할 수 있도록 다음 출처를 함께 묶었다.

- `perf/patchmap-render-optimization` 최종 커밋 히스토리
- reflog에 남은 reset/분기 흐름
- reverted experiment commit diff
- reverted docs experiment commit 내용
- `.gstack/benchmark-reports`의 frame benchmark JSON/MD 리포트
- 현재 `main`과 perf/v2 branch diff 구조

검토 결과, perf 브랜치 최종 상태에 남은 채택 변경과 revert된 실험은 모두 이 문서 안에서 추적 가능하다. 커밋 없이 benchmark 리포트만 남은 PoC는 "추가 benchmark-only PoC 흔적"으로 따로 분리했다. 해당 항목은 정확한 코드 diff를 복구할 수 없으므로 main 적용 후보로 보지 않고, 반려 방향의 근거로만 사용한다.

## 범위와 기준

- 브랜치: `perf/patchmap-render-optimization`
- 분기 기준: `ae9333c` / `v0.9.1`
- 최종 브랜치 HEAD: `198c5ad chore: revert packed color cpu mesh experiment record`
- 주요 데이터: `.gstack/benchmark-harness/patch-service-plant-map-data.json`
- 데이터 크기:
  - top-level nodes: 458
  - raw JSON objects: 12,184
  - raw JSON arrays: 579
  - panel items: 9,336
  - inverter items: 26
  - total runtime items: 9,365
  - JSON size: 약 795KB
- 주요 benchmark:
  - `.gstack/benchmark-harness/run-patchmap-frame-benchmark.mjs`
  - `PATCHMAP_BENCH_CPU_THROTTLE=4 node .gstack/benchmark-harness/run-patchmap-frame-benchmark.mjs`

## 고정한 시나리오

| 시나리오 | 목적 |
| --- | --- |
| `idle baseline after draw` | 최초 draw 이후 안정 프레임 |
| `draw: redraw same data with fit` | 같은 데이터 redraw와 fit |
| `draw+update: all panel animated bar heights` | 전체 panel bar 높이 animated update |
| `update: all panel animated bar heights every 1s x10` | 전체 bar 높이 변경 10회 반복 |
| `interaction: wheel canvas pan for 120 frames` | 휠 pan 체감 성능 |
| `interaction: ctrl wheel zoom in/out for 120 frames` | ctrl+wheel zoom 체감 성능 |
| `interaction: transformer single object select` | transformer 단일 선택 |
| `interaction: shift drag multi select` | shift+drag 멀티 선택 |
| `update: panel mixed state burst` | panel state 혼합 burst |
| `update: panel chart stream for 120 frames` | patch-service chart stream |
| `update: highlight bulk alpha burst` | 대량 alpha/highlight update |
| `update: relations visibility by path` | relation path update |
| `update: report panel backgrounds burst` | report background burst |

## 최종 커밋 흐름

| 커밋 | 성격 | 요약 |
| --- | --- | --- |
| `5ccab05` | 채택 | panel rendering/selection 최적화의 큰 묶음 |
| `38c4cf0` | 채택 테스트 | patch-service 계약 테스트 추가 |
| `8307b22` | 채택 환경 | `.gstack` benchmark report ignore |
| `320043a` | 채택 | dirty panel bar를 전체 scan 대신 직접 queue로 flush |
| `6b3c48e` | 채택 | Pixi world render group 활성화 |
| `c20507b` | 채택 | panel bar lookup 중복 제거 |
| `ec5659a` | 채택 | aggregate bar eligibility 재사용 |
| `3ddd06a` | 채택 | aggregate panel bar update 추가 최적화 |
| `1bb7baa` -> `ae1c2b3` | 반려 | flat aggregate bar particle 실험 후 revert |
| `bf2f6f1` -> `27b4c36` | 반려 | aggregate viewport culling 실험 후 revert |
| `a76cfcf` -> `ee1e448` | 반려 | aggregate alpha fast path 실험 후 revert |
| `32f8dd0` -> `f2a5cf1` | 반려 기록 | custom mesh no-slice 실험 문서 기록 후 revert |
| `7a22e9e` -> `c87c4f0` | 반려 기록 | CPU mesh aggregate bars 실험 문서 기록 후 revert |
| `e1d9f0e` -> `7bf0c86` | 반려 기록 | GPU animation mesh bars 실험 문서 기록 후 revert |
| `908f871` -> `198c5ad` | 반려 기록 | packed-color CPU mesh bars 실험 문서 기록 후 revert |

## 채택된 실험

### 1. Panel rendering/selection 최적화

커밋: `5ccab05 perf(patchmap): optimize panel rendering and selection`

변경:

- `SceneIndex` 추가
  - `elementById`
  - `byType`
  - `byDisplay`
  - `selectable`
  - `version`
- selector 일부를 `jsonpath-plus` 전체 순회 대신 index로 처리
  - exact id path
  - `children[?(@.type == "...")]`
  - `children[?(@.display == "...")]`
- selection hit-test 후보 수를 줄임
  - selectable index 사용
  - point/polygon candidate bounds cache
  - `warmFindBoundsCache`로 draw 이후 bounds cache를 frame budget 안에서 예열
- `patchmap.draw` 최적화
  - 같은 data redraw 시 validated data/cache 재사용
  - managed world children만 있으면 scene reuse 가능
  - draw event를 `scheduler.postTask` 또는 `setTimeout`으로 user-visible task 처리
- direct element update fast path
  - `validateSchema: false`
  - path/history/rotateOrigin 없는 단일 element update
  - panel component change는 별도 renderer로 빠르게 적용
- `PanelBarLayer` 추가
  - Pixi `ParticleContainer` 기반 aggregate bar layer
  - bar를 일반 child DisplayObject로 모두 그리지 않고 aggregate particle로 렌더
  - nine-slice texture를 piece로 쪼개 rounded bar를 보존
  - bar animation을 layer 내부 requestAnimationFrame으로 처리
  - alpha/tint/placement/rotation 반영
- `panelComponentRenderer` 추가
  - patch-service panel update shape를 빠르게 적용
  - `[{ type: 'bar' }, { type: 'icon', show: false }, { type: 'text', show: false }]` 형태를 aggregate bar path로 처리
  - item별 background/bar/icon/text component cache
  - deferred visual queue와 per-frame budget 적용

결과:

- CPU 1x 기준 대다수 interaction/draw/update는 60fps 근처로 도달했다.
- 첫 대표 리포트 `.gstack/benchmark-reports/2026-04-29T14-50-47-471Z-patchmap-frame-benchmark.json`:

| 시나리오 | FPS | p95 ms | long tasks |
| --- | ---: | ---: | ---: |
| idle baseline | 60.00 | 16.9 | 0 |
| draw redraw+fit | 60.00 | 17.2 | 0 |
| draw+update all bars | 60.00 | 16.9 | 0 |
| all bars x10 | 60.00 | 17.4 | 0 |
| wheel pan | 60.00 | 17.0 | 0 |
| ctrl+wheel zoom | 60.00 | 17.1 | 0 |
| transformer select | 60.00 | 17.3 | 0 |
| shift drag multi select | 59.39 | 17.1 | 0 |
| mixed state burst | 48.91 | 17.7 | 2 |
| chart stream | 39.69 | 50.0 | 9 |
| highlight alpha burst | 53.89 | 17.7 | 2 |
| relations visibility | 60.00 | 17.6 | 0 |
| report backgrounds burst | 54.92 | 33.3 | 2 |

판단:

- panel bulk update, pan/zoom, transformer/select 계열에는 즉시 효과가 있었다.
- chart stream, mixed burst, alpha/background burst에는 여전히 long task와 spike가 남았다.

### 2. Patch-service 계약 테스트

커밋: `38c4cf0 test(patchmap): cover patch service contracts`

변경:

- `src/tests/render/patch-service-contract.test.js` 추가
- patch-service가 실제로 쓰는 panel update shape를 테스트로 고정
- aggregate bar stream, hidden icon/text, selector/update path 호환을 보호

판단:

- 성능 개선 자체는 아니지만 main 적용 후보를 고를 때 필수 안전장치다.
- perf 브랜치에서 가장 가져갈 가치가 높은 비기능 변경이다.

### 3. Benchmark report ignore

커밋: `8307b22 chore(gitignore): ignore local benchmark artifacts`

변경:

- `.gstack` benchmark report가 계속 쌓이므로 gitignore 추가

판단:

- report는 로컬 비교 근거로 남기되 main에는 올리지 않는 운영 정책으로 적절하다.

### 4. Dirty panel bars direct flush

커밋: `320043a perf(patchmap): flush dirty panel bars directly`

변경:

- 기존에는 dirty panel bar가 생기면 `sceneIndex.byType('item')` 전체를 다시 훑는 방식이었다.
- 변경 후에는 dirty bar component를 `queue.dirtyPanelBars`에 직접 넣고 해당 bar만 flush한다.
- frame budget은 유지한다.

결과:

- 전체 item scan을 피하므로 전체 panel update에서 불필요한 순회가 줄었다.
- 같은 시간대 CPU 1x 리포트는 계속 60fps 근처를 유지했다.

판단:

- main에 가져가기 좋은 좁은 변경이다.
- v2에서도 유사한 "dirty owner 직접 관리" 방향으로 이어졌다.

### 5. World render group

커밋: `6b3c48e perf(patchmap): enable world render group`

변경:

- `this._world.enableRenderGroup?.()` 호출 추가

결과:

- 단독 효과는 큰 폭으로 분리 측정하기 어렵다.
- CPU 1x 리포트는 대체로 60fps를 유지했다.

판단:

- 변경 폭은 매우 작다.
- 다만 Pixi render group은 scene 구조/레이어와 상호작용하므로 main 적용 시 visual layer ordering, viewport transform, relation layer를 같이 확인해야 한다.

### 6. Redundant panel bar lookup 제거

커밋: `c20507b perf(patchmap): skip redundant panel bar lookups`

변경:

- aggregate bar state update path에서 이미 cache된 `item._panelIconComponent`, `item._panelTextComponent`를 사용
- `getPanelComponentByType` 반복 호출을 줄임

결과:

- 미세 최적화지만 risk가 낮다.
- CPU 1x에서는 chart/highlight가 다소 흔들렸지만 반복 리포트에서 안정화됐다.

판단:

- main 적용 후보.

### 7. Aggregate bar eligibility 재사용

커밋: `ec5659a perf(patchmap): reuse aggregate bar eligibility`

변경:

- `markPanelBarVisualDirty`에서 매번 `ensurePanelBarLayer(...).canRender(...)`를 계산하지 않음
- source가 바뀌었거나 aggregate 사용 상태가 없거나 layer가 destroyed일 때만 eligibility 재계산

결과:

- source가 그대로인 height/tint/alpha stream에서는 불필요한 texture/layer 검사 감소
- 대표 안정 리포트 `.gstack/benchmark-reports/2026-04-30T01-53-36-160Z-patchmap-frame-benchmark.json`:

| 시나리오 | FPS | p95 ms | long tasks |
| --- | ---: | ---: | ---: |
| draw+update all bars | 60.00 | 17.1 | 0 |
| all bars x10 | 59.99 | 17.9 | 0 |
| wheel pan | 60.00 | 17.8 | 0 |
| ctrl+wheel zoom | 60.05 | 17.3 | 0 |
| chart stream | 56.49 | 33.3 | 0 |
| highlight alpha burst | 55.41 | 18.4 | 2 |
| report backgrounds burst | 59.39 | 18.0 | 0 |

판단:

- source 변경이 드문 patch-service bar stream에 적합하다.
- main 적용 후보.

### 8. Aggregate panel bar update 최적화

커밋: `3ddd06a perf: optimize aggregate panel bar updates`

변경:

- `PanelBarLayer`의 `particleChildren` 변경 시 즉시 `update()`하지 않고 `flushParticleChildrenUpdate()`로 모아서 처리
- animation 시작 state를 clone해 in-place state mutation과 충돌하지 않도록 수정
- `_applyStateValues`로 상태 적용 경로를 숫자 인자로 단순화
- borderless/nine-slice fast path 추가
- dirty bar flush 중 새 dirty bar가 들어오는 경우 `nextDirtyPanelBars`로 다음 frame에 넘김
- dirty particle layer set을 모아 한 번에 flush
- patch-service aggregate stream 테스트 추가

결과:

- 나중의 mesh 실험 기준 baseline으로 사용됐다.
- `.gstack/benchmark-reports/2026-05-13T08-29-31-964Z-patchmap-frame-benchmark.json` 기준 CPU 4x:

| 시나리오 | FPS | p95 ms | long tasks |
| --- | ---: | ---: | ---: |
| draw+update all bars | 52.43 | 33.4 | 0 |
| all bars x10 | 38.42 | 34.2 | 0 |
| wheel pan | 26.69 | 50.8 | 9 |
| ctrl+wheel zoom | 36.00 | 34.2 | 0 |
| transformer select | 52.91 | 33.4 | 0 |
| shift drag multi select | 46.54 | 33.9 | 1 |
| chart stream | 12.46 | 117.0 | 117 |
| highlight alpha burst | 25.75 | 50.0 | 2 |
| report backgrounds burst | 28.96 | 50.1 | 4 |

판단:

- CPU 4x에서는 여전히 실패가 많지만, particle/nine-slice 기반 aggregate를 유지하면서 bulk update를 다룰 수 있는 기준 구현이 됐다.
- 이 구현을 기준으로 mesh 계열 PoC가 비교됐다.

## 0.9.1 / perf branch / v2 3-way 비교

리포트: `.gstack/benchmark-reports/2026-05-14T06-39-39-163Z-patchmap-3way-frame-benchmark-isolated.json`

이 리포트는 isolated mode라 절대 FPS가 낮다. 같은 리포트 안 상대 비교만 본다.

| 시나리오 | perf FPS | 0.9.1 FPS | perf vs 0.9.1 |
| --- | ---: | ---: | ---: |
| idle baseline | 5.36 | 4.75 | +12.8% |
| draw redraw+fit | 5.15 | 4.61 | +11.7% |
| draw+update all bars | 4.35 | 3.31 | +31.4% |
| all bars x10 | 4.32 | 3.43 | +25.9% |
| wheel pan | 5.39 | 4.46 | +20.9% |
| ctrl+wheel zoom | 5.81 | 5.89 | -1.4% |
| transformer select | 4.21 | 4.73 | -11.0% |
| shift drag multi select | 5.11 | 4.92 | +3.9% |
| mixed state burst | 3.65 | 3.05 | +19.7% |
| chart stream | 3.66 | 3.46 | +5.8% |
| highlight alpha burst | 5.34 | 5.15 | +3.7% |
| relations visibility | 5.61 | 6.18 | -9.2% |
| report backgrounds burst | 5.41 | 5.60 | -3.4% |

해석:

- perf branch는 0.9.1 대비 bulk draw/update, x10, wheel pan에서 개선됐다.
- ctrl zoom, transformer, relation/background 일부는 0.9.1보다 나쁘거나 비슷하다.
- v2와 비교하면 perf branch는 isolated mode에서 `all bars x10`, `wheel pan`, `chart stream`만 근소하게 앞섰고, 대부분은 v2가 앞섰다.

## 대표 리포트 요약

| 리포트 | 조건 | 의미 |
| --- | --- | --- |
| `2026-04-29T14-50-47-471Z` | CPU 1x, headless | 초기 큰 perf patch 직후 대표값 |
| `2026-04-30T04-58-58-969Z` | CPU 1x, headless | Apr 30까지 채택된 perf 변경의 안정 대표값 |
| `2026-04-30T04-55-28-711Z` | CPU 4x, headed, FPS overlay on | 시각 확인용에 가까움. overlay/headed라 순수 비교값으로는 약함 |
| `2026-05-13T08-29-31-964Z` | CPU 4x, headless | mesh PoC들의 baseline으로 사용 |
| `2026-05-14T03-22-21-649Z` | CPU 4x, headless, perf branch 재측정 | 최종 perf branch 재측정. 다른 4x 리포트보다 낮게 나와 환경/측정 노이즈 가능성이 큼 |

CPU 1x 안정 대표값:

리포트: `.gstack/benchmark-reports/2026-04-30T04-58-58-969Z-patchmap-frame-benchmark.json`

| 시나리오 | FPS | p95 ms | long tasks |
| --- | ---: | ---: | ---: |
| idle baseline | 59.99 | 17.5 | 0 |
| draw redraw+fit | 60.00 | 17.1 | 0 |
| draw+update all bars | 60.00 | 16.9 | 0 |
| all bars x10 | 60.00 | 17.2 | 0 |
| wheel pan | 60.03 | 17.2 | 0 |
| ctrl+wheel zoom | 60.00 | 17.1 | 0 |
| transformer select | 60.00 | 16.8 | 0 |
| shift drag multi select | 60.00 | 17.5 | 0 |
| mixed state burst | 53.39 | 17.6 | 2 |
| chart stream | 56.89 | 32.6 | 0 |
| highlight alpha burst | 57.06 | 17.5 | 2 |
| relations visibility | 59.98 | 17.2 | 0 |
| report backgrounds burst | 59.39 | 17.2 | 0 |

해석:

- CPU 1x에서는 대부분 체감상 매우 부드럽다.
- strict pass 기준으로는 mixed/highlight의 long task가 남는다.

## 반려한 실험

### 1. Flat aggregate bar particle

커밋: `1bb7baa perf: record flat aggregate bar particle experiment` -> `ae1c2b3 chore: revert flat aggregate bar particle experiment`

변경:

- aggregate bar가 실제 `getBarTexture` 결과를 사용하지 않고 `Texture.WHITE` 하나로 렌더
- tint는 `bar.props.tint` 또는 `bar.props.source.fill`에서 계산
- 사실상 rounded/nine-slice를 버리고 flat rect particle로 단순화

결과:

- 커밋에 안정 benchmark 문서가 붙지는 않았다.
- 이후 `custom mesh no-slice` 실험에서 radius 제거/flat path가 일부 bulk에는 도움되지만 chart/alpha가 크게 나빠지는 패턴을 확인했다.

판단:

- rounded bar 시각 계약과 patch-service 렌더 parity를 깨기 쉬워 반려.

### 2. Aggregate bar viewport culling

커밋: `bf2f6f1 perf: record aggregate bar viewport culling experiment` -> `27b4c36 chore: revert aggregate bar viewport culling experiment`

변경:

- `CULLING_MARGIN = 512`
- aggregate entry set을 따로 관리
- viewport `moved`, `zoomed` 이벤트에 반응해 visible entry만 `particleChildren`에 남김
- viewport bounds와 bar state intersect로 particleChildren 재구성

결과:

- particleChildren 재구성 비용이 pan/zoom 중 절감 효과보다 컸다.
- culling이 이득을 보려면 단순 children rebuild가 아니라 spatial index와 안정적인 visible set diff가 필요하다.

판단:

- naive viewport culling은 반려.

### 3. Aggregate bar alpha fast path

커밋: `a76cfcf perf: record aggregate bar alpha fast path experiment` -> `ee1e448 chore: revert aggregate bar alpha fast path experiment`

변경:

- `syncAlphaForSubtree(root)`에서 root가 cached bar를 가진 leaf panel이면 subtree stack 순회를 생략
- root bar entry alpha만 바로 갱신

결과:

- 커밋에 안정 benchmark 문서가 붙지는 않았다.
- leaf panel에는 도움이 될 수 있지만, nested item/child 관계와 alpha propagation 계약을 일반화하기 어렵다.

판단:

- 제한적인 fast path라 반려.
- main에 가져가려면 alpha-only dirty index를 별도 설계해야 한다.

### 4. CPU mesh aggregate bars

커밋 기록: `7a22e9e docs: record cpu mesh aggregate bar experiment` -> `c87c4f0 chore: revert cpu mesh aggregate bar experiment record`

변경:

- aggregate panel bar particles를 CPU-updated custom Pixi Mesh로 대체
- rounded/nine-slice 렌더 유지
- bar state change와 animation tick에서 JS로 vertex buffer 갱신

리포트:

- baseline: `.gstack/benchmark-reports/2026-05-13T08-29-31-964Z-patchmap-frame-benchmark.json`
- experiment: `.gstack/benchmark-reports/2026-05-13T09-19-39-148Z-patchmap-frame-benchmark.json`

| 시나리오 | baseline FPS | experiment FPS | 변화 |
| --- | ---: | ---: | ---: |
| draw+update animated bars | 52.43 | 58.14 | +10.9% |
| all bars x10 | 38.42 | 59.01 | +53.6% |
| wheel pan | 26.69 | 49.30 | +84.7% |
| ctrl wheel zoom | 36.00 | 46.63 | +29.5% |
| transformer select | 52.91 | 59.97 | +13.3% |
| shift drag multi select | 46.54 | 58.22 | +25.1% |
| mixed state burst | 26.57 | 28.53 | +7.4% |
| chart stream | 12.46 | 10.39 | -16.6% |
| highlight alpha burst | 25.75 | 17.32 | -32.7% |
| report backgrounds burst | 28.96 | 30.62 | +5.7% |

판단:

- bulk animation, pan/zoom에는 가장 강한 개선 가능성을 보였다.
- 그러나 patch-service chart stream과 alpha burst가 크게 나빠져 default renderer로는 반려.
- main 후보로는 "전면 대체"가 아니라 특정 bulk-only opt-in 또는 더 세밀한 dirty path가 필요하다.

### 5. GPU animation mesh bars

커밋 기록: `e1d9f0e docs: record gpu animation mesh bar experiment` -> `7bf0c86 chore: revert gpu animation mesh bar experiment record`

변경:

- custom Pixi Mesh 사용
- bar animation interpolation을 shader/uniform time과 per-bar from/to/timing attribute로 이동

리포트:

- experiment: `.gstack/benchmark-reports/2026-05-13T09-36-50-452Z-patchmap-frame-benchmark.json`

| 시나리오 | baseline FPS | experiment FPS | 변화 |
| --- | ---: | ---: | ---: |
| draw+update animated bars | 52.43 | 42.67 | -18.6% |
| all bars x10 | 38.42 | 41.15 | +7.1% |
| wheel pan | 26.69 | 17.28 | -35.3% |
| ctrl wheel zoom | 36.00 | 29.77 | -17.3% |
| chart stream | 12.46 | 9.80 | -21.3% |
| highlight alpha burst | 25.75 | 6.84 | -73.4% |

판단:

- CPU animation work 감소보다 shader/attribute overhead가 더 컸다.
- 반려.

### 6. Packed-color CPU mesh bars

커밋 기록: `908f871 docs: record packed color cpu mesh experiment` -> `198c5ad chore: revert packed color cpu mesh experiment record`

변경:

- CPU mesh 사용
- rounded bar를 6-piece borderless layout으로 단순화
- color를 `unorm8x4` vertex attribute로 packing

리포트:

- experiment: `.gstack/benchmark-reports/2026-05-13T10-05-18-563Z-patchmap-frame-benchmark.json`

| 시나리오 | baseline FPS | experiment FPS | 변화 |
| --- | ---: | ---: | ---: |
| draw+update animated bars | 52.43 | 38.43 | -26.7% |
| all bars x10 | 38.42 | 41.70 | +8.5% |
| wheel pan | 26.69 | 19.30 | -27.7% |
| ctrl wheel zoom | 36.00 | 17.80 | -50.6% |
| transformer select | 52.91 | 49.33 | -6.8% |
| shift drag multi select | 46.54 | 50.58 | +8.7% |
| mixed state burst | 26.57 | 18.42 | -30.7% |
| chart stream | 12.46 | 10.08 | -19.1% |
| highlight alpha burst | 25.75 | 19.14 | -25.7% |
| report backgrounds burst | 28.96 | 26.22 | -9.5% |

판단:

- color packing과 piece 수 감소가 mesh update overhead를 상쇄하지 못했다.
- 반려.

### 7. Custom mesh no-slice / radius 제거

커밋 기록: `32f8dd0 docs: record custom mesh no slice experiment` -> `f2a5cf1 chore: revert custom mesh no slice experiment record`

변경:

- aggregate bar를 custom CPU-updated Pixi Mesh로 렌더
- nine-slice/radius 제거
- flat no-radius quad로 단순화

리포트:

- experiment: `.gstack/benchmark-reports/2026-05-13T10-14-52-837Z-patchmap-frame-benchmark.json`

| 시나리오 | baseline FPS | experiment FPS | 변화 |
| --- | ---: | ---: | ---: |
| draw+update animated bars | 52.43 | 49.22 | -6.1% |
| all bars x10 | 38.42 | 44.43 | +15.6% |
| wheel pan | 26.69 | 31.99 | +19.9% |
| ctrl wheel zoom | 36.00 | 38.88 | +8.0% |
| chart stream | 12.46 | 8.91 | -28.5% |
| highlight alpha burst | 25.75 | 13.57 | -47.3% |

판단:

- radius 제거는 일부 bulk/interaction에는 도움된다.
- 하지만 chart/alpha를 크게 악화시키고 visual contract도 약화한다.
- main 적용 기본값으로는 반려.

## 추가 benchmark-only PoC 흔적

다음 리포트들은 커밋으로 남은 구현명이 없거나 실험 문서가 revert되어 정확한 코드 diff는 남지 않았다. 다만 모두 CPU 4x에서 baseline보다 chart/alpha 또는 pan/update가 나빠져 최종 브랜치에 남지 않았다.

| 리포트 | draw+update FPS | x10 FPS | wheel FPS | chart FPS | highlight FPS | 판단 |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| `2026-05-13T10-17-29-409Z` | 50.99 | 46.95 | 37.21 | 9.47 | 20.71 | 일부 bulk 개선, chart/alpha 회귀 |
| `2026-05-13T10-21-07-863Z` | 47.35 | 38.48 | 30.35 | 8.37 | 11.28 | 전반 회귀 |
| `2026-05-13T10-23-08-712Z` | 42.35 | 26.59 | 21.68 | 7.97 | 10.17 | 전반 회귀 |
| `2026-05-14T01-27-02-132Z` | 49.88 | 36.00 | 26.87 | 10.43 | 23.85 | baseline 근처, 채택 근거 부족 |
| `2026-05-14T01-28-53-516Z` | 39.22 | 32.86 | 30.47 | 8.26 | 18.65 | 전반 회귀 |
| `2026-05-14T01-31-33-749Z` | 49.01 | 37.34 | 32.65 | 10.73 | 24.24 | baseline 근처, 채택 근거 부족 |
| `2026-05-14T01-34-34-044Z` | 43.15 | 28.17 | 26.24 | 9.54 | 15.16 | 전반 회귀 |
| `2026-05-14T01-37-56-966Z` | 44.70 | 30.21 | 29.32 | 8.11 | 4.76 | alpha 심각 회귀 |
| `2026-05-14T01-43-02-763Z` | 48.17 | 33.39 | 29.66 | 10.01 | 20.00 | 채택 근거 부족 |

## v2로 옮겨진 임시 커밋

reflog 기준 다음 커밋들은 잠시 perf 브랜치 위에 만들어졌다가 `rewrite/patchmap-v2-engine` 브랜치로 분기된 뒤, perf 브랜치는 `198c5ad`로 reset됐다.

| 커밋 | 현재 위치 | 내용 |
| --- | --- | --- |
| `833ab7a` | v2 branch | cleanroom feature contracts |
| `8cf4930` | v2 branch | patch-service aggregate bar stream contracts |
| `63be7a6` | v2 branch | logical scene index |
| `a595312` | v2 branch | selector route through logical index |

이 항목들은 perf branch 최종 결과가 아니므로 main 적용 판단에서는 v2 실험 로그와 함께 봐야 한다.

## main 적용 후보 판단

가져가기 좋은 후보:

- patch-service 계약 테스트
- `.gstack` benchmark report ignore
- SceneIndex 기반 selector/find 후보 축소
- selection bounds cache와 `warmFindBoundsCache`
- direct element update fast path 중 `validateSchema: false` 단일 element + component update에 한정된 부분
- panel component cache
- dirty panel bars direct queue
- aggregate bar eligibility cache
- `PanelBarLayer`의 particleChildren flush batching

주의해서 가져갈 후보:

- world render group
  - 레이어 순서, relation, viewport transform 확인 필요
- aggregate bar layer
  - patch-service bar-only panel에는 효과가 큼
  - icon/text가 보이거나 mask/filter/blendMode가 있으면 fallback 필요
- per-frame visual queue
  - UI freeze를 줄이지만 "적용이 늦게 보이는" 체감이 생길 수 있음

가져가지 말아야 할 후보:

- flat `Texture.WHITE` aggregate bar
- naive viewport culling
- leaf-only alpha fast path
- custom mesh full replacement
- GPU-side animation mesh
- packed-color CPU mesh
- no-slice/radius 제거 기본 적용

## 결론

perf 브랜치에서 가장 의미 있었던 개선은 custom mesh가 아니라 기존 Pixi displayObject 구조 안에서 다음을 줄인 것이다.

- selector/find의 전체 scene traversal
- panel component lookup
- 전체 item scan
- 일반 bar DisplayObject 렌더/animation work
- `ParticleContainer.update()` 즉시 호출 횟수

반대로 custom mesh 계열은 bulk bar update에서는 눈에 띄는 잠재력이 있었지만, patch-service에서 중요한 chart stream과 highlight alpha burst를 반복적으로 악화시켰다. main에 적용할 때는 perf 브랜치의 작은 안전한 최적화와 테스트를 우선하고, renderer 전면 교체는 v2 문서의 cleanroom 설계/렌더 parity 검증과 함께 별도 판단해야 한다.
