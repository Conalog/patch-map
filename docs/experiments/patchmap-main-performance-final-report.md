# Patchmap Main Performance Final Report

이 보고서는 `main` 브랜치의 성능 병목을 기준으로 `perf/patchmap-render-optimization`와 `rewrite/patchmap-v2-engine`에서 진행한 실험을 종합한 최종 판단이다. 목표는 실제 `main`에 어떤 성능 개선을 가져갈지 결정하는 것이다.

참고 문서:

- `docs/experiments/patchmap-perf-branch-performance-experiments.md`
- `docs/experiments/patchmap-v2-performance-experiments.md`

## Documentation Review Result

두 실험 문서를 다시 검토한 결과, 새 세션에서 시작해도 다음 정보를 파악할 수 있다.

- 어떤 브랜치에서 어떤 커밋이 채택됐는지
- 어떤 실험이 revert됐는지
- 어떤 benchmark report를 기준으로 판단했는지
- 각 실험이 어떤 시나리오를 개선하거나 악화했는지
- 렌더 parity, animation, padding, alpha, relation layer, rotation 같은 기능/시각 리스크가 무엇이었는지
- main에 가져갈 후보와 가져가지 말아야 할 후보가 무엇인지

보강한 내용:

- 두 문서에 `Documentation Review` 섹션을 추가했다.
- 커밋 없이 benchmark report만 남은 PoC는 영속 diff가 없다는 점을 명시했다.
- perf 브랜치에 잠시 올라갔다가 v2로 옮겨진 커밋을 perf 최종 결과와 분리했다.

남은 한계:

- 일부 실험은 대화 중 즉시 revert되어 정확한 diff가 남아 있지 않다.
- benchmark는 대부분 단일 로컬 실행이다. 절대 FPS보다 같은 리포트 안 상대 비교가 더 신뢰할 만하다.
- current `main`은 `v0.9.2`이며, `v0.9.1` 이후 성능 구조 변경이 거의 없어서 0.9.1 benchmark를 current main 병목의 대표값으로 사용한다.

## Current Main Baseline

현재 `main`:

- HEAD: `351e037 0.9.2`
- `v0.9.1` 이후 주요 변경: normalized text placement fix
- perf/v2의 SceneIndex, aggregate bar layer, panel component renderer, update coalescing, render scheduler는 포함되어 있지 않다.

main 코드 기준 병목:

| 영역 | 현재 main 동작 | 병목 |
| --- | --- | --- |
| draw | 매번 `JSON.parse(JSON.stringify(data))`, schema validation, full draw | 같은 데이터 redraw에서도 clone/validation/render 비용 반복 |
| selector | 모든 path를 `JSONSearch`로 children traversal | id/type/display 조회도 전체 scene 순회 |
| update | path selector 후 각 element에 일반 `apply` | patch-service의 대량 panel component update도 일반 update pipeline 사용 |
| components | component change마다 children copy, schema/default materializer, priority lookup | 9,336 panel item 전체 update에서 반복 비용 큼 |
| selection | 매 hit-test마다 `collectCandidates`로 selectable 후보 탐색 | shift-drag, transformer select에서 후보 탐색과 bounds 계산 반복 |
| bar rendering | 각 bar가 일반 DisplayObject/Graphics/Sprite path로 존재 | bar-only panel에서도 객체 수와 animation update가 많음 |
| bulk update | latest-state queue/coalescing/frame budget 없음 | 대량 update가 한 번에 몰리면 main thread spike |
| culling | scene 전체 Pixi object 유지 | viewport 밖 object도 update 대상이 되기 쉬움 |

0.9.1 proxy benchmark:

리포트: `.gstack/benchmark-reports/2026-05-14T06-39-39-163Z-patchmap-3way-frame-benchmark-isolated.json`

| 시나리오 | 0.9.1 FPS | 의미 |
| --- | ---: | --- |
| idle baseline | 4.75 | 대용량 scene 유지 비용 |
| draw redraw+fit | 4.61 | redraw/full validation/full render 비용 |
| draw+update all bars | 3.31 | 전체 panel bar update 병목 |
| all bars x10 | 3.43 | 반복 bulk update 병목 |
| wheel pan | 4.46 | 많은 DisplayObject와 transform/update 부담 |
| ctrl+wheel zoom | 5.89 | zoom 자체는 상대적으로 덜 나쁨 |
| transformer select | 4.73 | selection candidate 탐색 비용 |
| shift drag multi select | 4.92 | multi-selection bounds/hit-test 비용 |
| mixed state burst | 3.05 | show/alpha/size 혼합 update 병목 |
| chart stream | 3.46 | 작은 panel update가 계속 들어오는 stream 병목 |
| highlight alpha burst | 5.15 | alpha propagation/update 병목 |
| relations visibility | 6.18 | relation path update 비용 |
| report backgrounds burst | 5.60 | background component update 비용 |

이 isolated 리포트는 절대 FPS가 낮게 나오는 모드다. 중요한 점은 같은 리포트 안에서 perf/v2와 비교했을 때 main 계열이 bulk update, draw, pan, mixed burst에서 꾸준히 뒤처진다는 것이다.

## Perf Branch Result

perf 브랜치는 main의 구조를 크게 유지하면서 부분 최적화를 얹었다.

핵심 해결 방식:

- `SceneIndex`로 selector/find 후보 탐색 비용 감소
- selection bounds cache와 `warmFindBoundsCache`
- direct element update fast path
- patch-service panel component renderer
- aggregate `PanelBarLayer`
- dirty panel bar direct queue
- aggregate eligibility cache
- `ParticleContainer.update()` batching

0.9.1 대비 3-way isolated 개선:

| 시나리오 | 0.9.1 FPS | perf FPS | 변화 |
| --- | ---: | ---: | ---: |
| draw redraw+fit | 4.61 | 5.15 | +11.7% |
| draw+update all bars | 3.31 | 4.35 | +31.4% |
| all bars x10 | 3.43 | 4.32 | +25.9% |
| wheel pan | 4.46 | 5.39 | +20.9% |
| mixed state burst | 3.05 | 3.65 | +19.7% |
| chart stream | 3.46 | 3.66 | +5.8% |
| highlight alpha burst | 5.15 | 5.34 | +3.7% |

CPU 1x 안정 대표 리포트에서는 대부분 60fps 근처까지 올라갔다.

리포트: `.gstack/benchmark-reports/2026-04-30T04-58-58-969Z-patchmap-frame-benchmark.json`

| 시나리오 | FPS | p95 ms | long tasks |
| --- | ---: | ---: | ---: |
| draw+update all bars | 60.00 | 16.9 | 0 |
| all bars x10 | 60.00 | 17.2 | 0 |
| wheel pan | 60.03 | 17.2 | 0 |
| ctrl+wheel zoom | 60.00 | 17.1 | 0 |
| transformer select | 60.00 | 16.8 | 0 |
| chart stream | 56.89 | 32.6 | 0 |
| highlight alpha burst | 57.06 | 17.5 | 2 |
| report backgrounds burst | 59.39 | 17.2 | 0 |

perf 브랜치의 장점:

- main 구조와 가까워서 적용 리스크가 낮다.
- patch-service 계약 테스트와 함께 가져갈 수 있다.
- main의 명확한 병목인 selector/find/update/component/bar rendering 비용을 직접 줄인다.

perf 브랜치의 한계:

- CPU 4x에서는 chart stream, highlight alpha, pan/zoom이 여전히 불안정했다.
- aggregate bar 조건과 fallback을 정확히 관리해야 한다.
- render architecture 자체는 legacy scene graph 중심이라 장기적으로 복잡도가 누적된다.

## V2 Result

v2는 main 구조를 유지하지 않고 cleanroom renderer 쪽으로 간 실험이다.

핵심 해결 방식:

- 공식 기능 계약 문서화
- Pixi native 무제한 호환보다 patch-map 공식 기능 우선
- model/index/render IR/render policy/scheduler 분리
- compatibility refs 유지
- aggregate atlas particle layer
- latest-state queue + coalescing + per-frame budget
- render plan refresh와 fallback
- rotated component layout 등 렌더 parity 보정

0.9.1 대비 3-way isolated 개선:

| 시나리오 | 0.9.1 FPS | v2 FPS | 변화 |
| --- | ---: | ---: | ---: |
| draw redraw+fit | 4.61 | 6.77 | +46.9% |
| draw+update all bars | 3.31 | 4.71 | +42.3% |
| all bars x10 | 3.43 | 4.00 | +16.6% |
| wheel pan | 4.46 | 5.05 | +13.2% |
| transformer select | 4.73 | 5.32 | +12.5% |
| mixed state burst | 3.05 | 3.75 | +23.0% |
| chart stream | 3.46 | 3.60 | +4.0% |
| highlight alpha burst | 5.15 | 5.91 | +14.8% |

최신 v2 단일 리포트:

리포트: `.gstack/benchmark-reports/2026-05-14T08-55-53-441Z-patchmap-frame-benchmark.json`

| 시나리오 | FPS | p95 ms | long tasks |
| --- | ---: | ---: | ---: |
| draw+update all bars | 55.54 | 17.6 | 2 |
| all bars x10 | 58.10 | 17.5 | 0 |
| wheel pan | 60.00 | 17.0 | 0 |
| ctrl+wheel zoom | 59.99 | 17.1 | 0 |
| transformer select | 60.03 | 17.3 | 0 |
| shift drag multi select | 59.98 | 17.3 | 0 |
| chart stream | 46.35 | 33.4 | 0 |
| highlight alpha burst | 37.31 | 17.6 | 2 |
| relations visibility | 60.00 | 17.5 | 0 |
| report backgrounds burst | 53.40 | 33.4 | 1 |

v2의 장점:

- 구조적으로 가장 장기성이 좋다.
- main의 draw/update/render coupling을 끊는 방향이다.
- 공식 기능을 좁히면 Pixi scene graph 전체 호환 부담을 줄일 수 있다.
- 0.9.1 대비 대부분 시나리오에서 가장 큰 상대 개선을 보였다.

v2의 한계:

- 렌더 parity 이슈가 실제로 많이 발생했다.
- chart stream, highlight alpha, mixed/background burst 병목은 아직 남아 있다.
- main에 바로 적용하기에는 변경량이 크다.
- 기존 tests 중 Pixi native object assumption을 가진 부분은 재정의가 필요하다.

## Rejected Strategy Summary

| 전략 | 결과 | 결론 |
| --- | --- | --- |
| CPU custom mesh full replacement | bulk/x10/pan은 크게 개선, chart/alpha 악화 | default renderer로 부적합 |
| GPU-side animation mesh | x10 소폭 개선, 대부분 회귀 | 부적합 |
| packed-color CPU mesh | 대부분 회귀 | 부적합 |
| radius/no-slice 제거 | 일부 bulk 개선, chart/alpha/visual contract 악화 | 기본값 부적합 |
| flat `Texture.WHITE` aggregate bar | rounded/nine-slice contract 약화 | 부적합 |
| naive viewport culling | `particleChildren` 재구성 비용이 큼 | 부적합 |
| leaf-only alpha fast path | 적용 범위가 좁고 alpha contract 리스크 | 단독 적용 부적합 |
| OffscreenCanvas/WebWorker | DOM/viewport/selection/main-thread state coupling 때문에 근거 부족 | 현재 우선순위 낮음 |
| bar spritesheet quantization | animation fidelity/texture churn 리스크, 유지 커밋 없음 | 현재 우선순위 낮음 |

## Which Approach Is Better?

단기 main 적용에는 perf 브랜치 방식이 더 낫다.

이유:

- current main의 병목을 직접 겨냥한다.
- 변경 범위가 v2보다 작다.
- patch-service 계약 테스트와 함께 단계적으로 넣을 수 있다.
- 성능 개선 근거가 있고 렌더 parity 리스크가 v2보다 낮다.

장기 최종 구조에는 v2 방향이 더 낫다.

이유:

- main의 근본 문제는 draw/update/render/interaction이 Pixi scene graph에 강하게 엮인 구조다.
- v2는 model/index/render policy/scheduler를 분리해 이 문제를 구조적으로 해결한다.
- Pixi native 무제한 호환을 공식 목표에서 낮추면 더 큰 최적화 여지가 생긴다.

하지만 v2를 main에 바로 적용하기에는 아직 이르다.

- render parity를 여러 차례 고쳤고, 아직 chart/alpha/mixed/background 병목이 남았다.
- 서비스 적용 전 `patch-service` demo/실사용 시각 검증이 더 필요하다.
- main에 들어가는 첫 개선은 안정적인 perf 브랜치 후보가 맞다.

## Recommended Main Plan

### Phase 1. Test and Benchmark Guardrails

가장 먼저 적용:

- patch-service contract tests
- benchmark harness/data/report ignore
- scenario list 고정

목적:

- 이후 성능 개선이 selector path/update shape/render parity를 깨지 않는지 보호한다.

### Phase 2. Index and Selection

적용 후보:

- `SceneIndex`
- selector exact id/type/display fast path
- selection candidate index
- bounds cache
- `warmFindBoundsCache`

해결하는 main 병목:

- selector full traversal
- transformer select/shift drag candidate traversal
- relation/path update lookup

### Phase 3. Patch-service Panel Fast Path

적용 후보:

- `panelComponentRenderer`
- panel component cache
- direct element update fast path
- dirty panel bar direct queue
- aggregate eligibility cache

해결하는 main 병목:

- 전체 panel component update
- chart stream
- hidden icon/text + bar-only update
- repeated child lookup/default/schema work

### Phase 4. Aggregate Bar Layer

적용 후보:

- `PanelBarLayer` particle aggregate
- nine-slice particle layout
- `flushParticleChildrenUpdate`
- animation state clone / numeric `_applyStateValues`

조건:

- rounded corner/padding/alpha/rotation/relation layer visual parity 확인
- icon/text show, mask/filter/blendMode에서는 fallback

해결하는 main 병목:

- 일반 bar DisplayObject 수
- bulk bar height animation
- repeated panel bar updates

### Phase 5. Draw Cache and Redraw Skip

적용 후보:

- same-data draw cache
- validated data reuse
- managed world children check
- unchanged redraw skip

해결하는 main 병목:

- redraw+fit
- repeated full clone/validation/full draw

### Phase 6. V2 Re-evaluation

조건:

- Phase 1-5 이후에도 Windows laptop/CPU throttle에서 목표 미달일 때
- patch-service real demo 시각 parity가 고정됐을 때
- chart stream/highlight alpha 병목에 대한 dirty bit/index 설계가 준비됐을 때

적용 방식:

- v2 전체 merge가 아니라, main에서 이미 검증한 public contract를 기반으로 별도 major refactor로 진행한다.

## Final Conclusion

main의 핵심 병목은 "너무 많은 Pixi scene graph object를 일반 경로로 계속 찾고, 업데이트하고, 렌더링하는 것"이다. perf 브랜치는 이 문제를 기존 구조 안에서 index/cache/aggregate layer로 줄였고, v2는 아예 model/render/scheduler를 분리해 장기 구조를 제시했다.

실제 main 적용 선택은 다음이 가장 합리적이다.

1. perf 브랜치의 안전한 최적화와 테스트를 먼저 main에 단계적으로 적용한다.
2. custom mesh, GPU animation, radius 제거, naive culling은 가져가지 않는다.
3. v2는 장기 방향으로 유지하되, 지금 바로 main replacement로 넣지 않는다.
4. 이후에도 병목이 남으면 v2에서 검증된 공식 기능 축소, render policy, latest-state queue, aggregate atlas layer를 선별적으로 다시 평가한다.

따라서 최종 추천은 "perf branch 기반의 점진적 main 적용 + v2 cleanroom 방향의 장기 재설계 유지"다.
