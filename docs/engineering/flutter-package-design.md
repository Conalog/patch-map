# Flutter package design review

- Status: proposed; 구현·성능 검증·배포 승인 전
- Date: 2026-09-14; 기준 commit: `3537152`, npm `1.0.0-alpha.7`
- Goal: WebView 없이 Flutter에서 직접 렌더링하고, npm과 Dart 패키지가 전체 기능을 동일하게 제공하면서 서로의 성능에 영향을 주지 않는다.
- Constraint: 코드는 공유해도, 독립 구현해도 된다. 문서 SSOT와 검증으로 일치하면 된다.
- Recommendation: 기존 TS/PixiJS를 유지한다. [bar slice 실측](flutter-mobile-benchmark.md)은 고빈도 geometry의 Dart 실행을 지지한다. 전체 engine은 [JS 재사용 대안](flutter-js-runtime-review.md)과 공통 conformance를 검증한 뒤 확정한다.

## 현재 구조와 재사용 근거

[Architecture](architecture.md)의 단일 상태·트랜잭션·프레임·정리 소유권을 각 구현 안에서 유지한다. 소스 구조를 일대일 복제할 필요는 없다. [공개 문서](../README.md)와 exported TypeScript 선언이 현재 계약의 출발점이며, 문서와 코드가 다르면 먼저 어느 쪽이 잘못됐는지 판정한다.

| 현재 소유자 | 설계 영향 |
| --- | --- |
| `src/index.ts`, `src/composition/pixi-engine-surface.ts` | mount가 Pixi 구현을 직접 조립한다. Flutter 추가만을 위해 기존 npm 진입점을 교체할 이유는 없다. |
| `src/public/contracts/lifecycle.ts` | 동기 update/transaction/snapshot, 비동기 mount/capture/destroy 의미를 Dart에서도 대응한다. |
| `src/semantic/`, `src/dense/`, `src/geometry/` | 정규화·안정 ID·기하·텍스트·트랜잭션 알고리즘과 fixture를 Dart 설계의 근거로 사용한다. |
| `src/engine/`, `src/core/`, `src/history/` | 상태 전이·history·이벤트·publication 순서를 conformance로 명시한다. |
| `src/rendering-port/`, `src/semantic/paint-order.ts` | 집계·paint order 설계를 참고한다. WebGL/Pixi probe까지 Dart에 그대로 이식하지 않는다. |
| `src/engine/capture-extraction-authority.ts` | 큐·freshness·resize 지연 동작은 같게 구현하되 DOM/readback 코드는 Flutter로 옮기지 않는다. |

## 구조 대안 비교

| 전략 | 기능 일치 관리 | 성능·운영 부담 | 판정 |
| --- | --- | --- | --- |
| TS/Pixi + Dart/Flame 독립 구현 | SSOT·동일 trace·회귀 테스트 필수 | 각 플랫폼별 최적화 가능; 버그 수정의 양쪽 검토 필요 | 현재 우선안 |
| 공통 schema·상수·Unicode/asset 데이터 생성 + 독립 runtime | 규칙 데이터의 drift 감소 | 빌드 시 공유하므로 runtime bridge 없음 | 우선안과 함께 선택적으로 채택 |
| Dart 코어 -> native/JS + 두 renderer | 동작 코드 공유 | npm interop·번들·GC/복사·기존 API 회귀 검증 및 코어 이전 필요 | 필요성이 입증되면 재검토 |
| Rust 코어 -> native/WASM + 두 renderer | 동작 코드 공유 | 전면 이전·ABI·native/WASM 수명·배포 도구 추가 | 지금 채택할 근거 부족 |
| TS 코어 + Flutter 내장 JS VM + native renderer | TS 규칙 재사용 | bridge·host 분리·수명 검증 필요; npm 격리 가능 | 독립 Dart와 비교 실험 |

공유·독립 코어 모두 renderer/host parity 검증이 필요하다. 반복 알고리즘의 유지보수 이득이 입증되면 해당 부분만 공유한다.

[Dart JS/interop](https://dart.dev/interop/js-interop/js-types)와 [Rust WASM](https://rustwasm.github.io/docs/wasm-pack/commands/build.html)/[Dart FFI](https://dart.dev/interop/c-interop)는 대안이지만, 웹 runtime 교체의 이득은 미측정이다. 독립안은 npm 회귀 범위를 줄인다.

## Flutter 렌더러 선정

| 후보 | 적합성 및 판정 |
| --- | --- |
| [Flame](https://pub.dev/packages/flame) | 조회 기준 1.38.2. 입력·스프라이트·배치·생명주기 도구를 제공하는 Pixi 대응 후보. Pixi API나 PatchMap 기능을 자동 제공하지는 않는다. |
| [CustomPainter](https://api.flutter.dev/flutter/rendering/CustomPainter-class.html) + Canvas | Flutter 기본 기능이며 build/layout 없이 repaint할 수 있다. 집계 렌더링에서 Flame의 효용과 오버헤드를 비교할 기준 구현이다. |
| [SpriteWidget](https://pub.dev/packages/spritewidget) | 2D 노드 대안이나 조회 기준 최신 배포가 4년 전이다. 현행 SDK·유지보수 검증 부담 때문에 우선하지 않는다. |

Flame의 [Game](https://pub.dev/documentation/flame/latest/game/Game-class.html) 또는 소수의 집계 레이어에서 [SpriteBatch](https://pub.dev/documentation/flame/latest/sprite/SpriteBatch-class.html), [Canvas.drawVertices](https://api.flutter.dev/flutter/dart-ui/Canvas/drawVertices.html)를 사용한다. 엔티티마다 Widget/Component/충돌 콜백을 생성하지 않는다. 같은 texture라도 paint 순서가 끊기면 batch를 분리한다. [flame_svg](https://pub.dev/packages/flame_svg)는 SVG 처리 후보이며 기존 asset admission을 대체하지 않는다.

Flame 카메라·collision·TextBox의 기본 동작을 제품 규칙으로 삼지 않는다. 선택한 동작 engine이 좌표·선택·줄바꿈을 결정하고 renderer는 결과를 그린다. Flutter 자체 Canvas를 쓰는 만큼 Flame이 Pixi GPU 최적화를 그대로 제공한다고 가정하지 않는다. 대표 scene 비교 결과가 직접 Canvas에 유리하면 renderer 선택만 바꿀 수 있게 한다.

## 독립 구현안 구조

```text
                버전 있는 공개 명세 SSOT
                 /                  \
         TS binding 명세        Dart binding 명세
                |                    |
       기존 TS PatchMap engine   Dart PatchMap engine
                |                    |
           Pixi adapter         Flame/Canvas adapter
                |                    |
        npm: @conalog/patch-map  pub.dev: 이름 미확정
                 \                  /
            공통 conformance 입력·기대 결과
```

동일 저장소에 Flutter package를 추가하는 구성을 우선한다. 기존 npm source/build 위치는 유지하고, Flutter는 별도 디렉터리·pubspec·lock/toolchain·테스트·산출물을 가진다. npm은 Flutter/Dart/Flame을 runtime 또는 빌드 의존성으로 요구하지 않고 Flutter는 Node/Pixi를 요구하지 않는다. 공유 schema/fixture/asset 원본은 개발·빌드 입력이며 상대 renderer를 배포물에 포함하지 않는다. 외부 사용자는 각 package manager로만 설치한다.

별도 저장소도 가능하며 불변 명세/conformance bundle의 버전/hash를 고정한다. 문서를 복제해 별도 수정하지 않는다. 한 저장소가 양쪽 변경 리뷰에는 유리하다.

Dart 내부는 controller/facade, semantic/geometry, transaction/history/editor, viewport/interaction/presentation, renderer, platform assets/lifecycle로 책임을 나눈다. Flutter rebuild가 controller를 재생성하지 않도록 한다. 상태·publication·frame schedule·cleanup 소유자는 인스턴스마다 각각 하나다. UI 상태관리 패키지를 소비자에게 강제하지 않는다.

## 동일성을 판단하는 기준

세부 feature matrix와 검증은 [Flutter conformance design](flutter-conformance-design.md)이 소유한다. 전체 기능을 대상으로 하며 editor·history·capture·접근성 등을 MVP에서 빼고 동등하다고 선언하지 않는다.

- 데이터·명령 결과·논리 기하·이벤트 의미는 공통 계약이다. 내부 class·알고리즘·cache·GPU batch 수는 같을 필요가 없다.
- DOM container와 Flutter Widget, WebGL 정보와 Flutter renderer 정보는 플랫폼 binding이다. 가짜 WebGL 값을 반환하지 않으며 기능 대응을 명시한다.
- CSS px는 Flutter logical px와 대응하고 DPR를 따로 적용한다. mouse/keyboard가 있는 Flutter에서는 관련 기능을 유지하고 touch 대체 동작을 정의한다.
- raster 픽셀·시스템 font·실시간 프레임 수까지 무조건 같다고 가정하지 않는다. 시각적 동일성 기준을 명세하고, 텍스트 잘림·기하·paint 순서 차이를 허용 오차로 숨기지 않는다.
- npm/Flutter package semver는 독립이어도 된다. 같은 contract revision과 전체 capability 집합을 검증한 조합을 동일 기능 버전으로 표시한다.

## 성능 격리와 위험

웹은 Flutter 도입 전후 npm dependency graph·artifact 내용·크기와 기존 hot-path 기준을 확인한다. 문서/fixture 추가만으로 웹 전체 benchmark를 반복하지 않는다. 공통화를 위해 웹 hot path를 바꾸는 경우에만 해당 [verification gate](verification.md)를 실행한다. 독립 구현은 간섭 경로를 줄이지만 실제 성능 무영향을 증명하는 측정의 대체물은 아니다.

Flutter는 기존 [performance fixtures](../../performance/fixtures/)와 실제 앱 데이터를 사용한다. seeded generator가 허용하는 최대는 현재 5,000 item이며 component 수를 함께 기록한다. 그 이상 규모는 사용자 workload를 확인한 뒤 별도 fixture로 정의한다. 실제 Android/iOS에서 현재 앱 WebView 경로와 native 후보를 같은 화면·기기·DPR·warmup 조건으로 비교한다.

첫 표시·pan/zoom/rotation 입력 지연·frame p50/p95·jank·batch update·text/image 갱신·capture·mount/dispose 메모리·idle CPU/배터리를 측정한다. Flame update/render 시간 외 Flutter raster/GPU도 본다. frame budget과 [materiality 정책](verification.md)을 사용하고 서로 다른 기기의 FPS로 우열을 결론내리지 않는다. 프레임별 전체 순회·전량 JSON 복사·불필요한 객체 생성·상시 idle loop·이중 ticker를 막는다. 캡처 외 불필요한 readback을 추가하지 않는다.

## 단계별 실행과 출시

| 단계 | 완성 조건 |
| --- | --- |
| T1 명세 기준선 | 전체 export/기능·실패·기본값·binding·시각 기준·지원 플랫폼을 conformance ID에 매핑한다. TS 선언은 TS shape 권위로 유지한다. |
| T2 후보 검증 | Flame/Canvas 및 독립 Dart/임베디드 JS를 비교한다. 중첩·회전·한글·bar 갱신·입력·PNG를 포함한다. |
| T3 선택안 구현 | dataset/geometry -> mutation/history/editor -> interaction/presentation -> assets/text/capture/lifecycle 순으로 계약별 구현·검증한다. JS 선택 시 TS 재사용과 native bridge를 구현한다. |
| T4 전체 qualification | 공통 conformance, 플랫폼 통합, 실기기 성능·메모리, 설치 consumer가 모두 통과한다. 빠진 기능은 출시 차단 항목이다. |
| T5 독립 배포 | npm/pub 버전과 contract/hash·통과 capability·지원 플랫폼을 release manifest에 기록하고 실제 설치 결과로 검증한다. |

최초 Flutter 구현 중 npm 유지보수는 계속할 수 있다. 제품 기능 변경은 SSOT와 양쪽 case를 함께 추가한다. 새 기능은 양쪽 구현·검증 완료 후 같은 계약을 지원하는 버전 조합으로 출시한다. 계약을 바꾸지 않는 플랫폼별 최적화·버그 수정은 해당 package만 배포할 수 있다.

현재 [npm publish workflow](../../.github/workflows/publish.yaml)는 branch/manual event를 사용한다. [pub.dev OIDC](https://dart.dev/tools/pub/automated-publishing)는 tag push로 시작한 workflow를 요구하므로 Dart용 tag 기반 배포 job과 권한을 별도로 둔다. analyze/test/publish dry-run·패키지 설치·assets/license 포함 검증을 수행하며 npm release 경로를 불필요하게 재작성하지 않는다. 이름·게시 권한·최소 SDK는 구현 전 확정한다.

두 registry의 publish는 원자적이지 않다. 한쪽만 성공하면 실제 조합을 release manifest에 남기고 실패한 쪽만 동일 검증 내용으로 재시도한다. pub OIDC 재시도는 원래 tag run을 사용한다. 배포 완료와 기능 동등성 완료를 구분한다.

## 검토 범위와 남은 결정

설계와 [bar 시뮬레이터 실험](flutter-mobile-benchmark.md)을 완료했다. 전체 Flutter 구현·실기기 검증은 남았다. Android/iOS는 필수다. 추가 플랫폼·최소 SDK·시각 허용차·입력 매핑은 미확정이다. 기능 축소나 공통 코어 재작성은 전제하지 않는다.

전체 API·일반 기하·실기기 성능과 구현 일정은 미검증이다.
