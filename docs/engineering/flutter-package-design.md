# Flutter package architecture decision

- Status: 구조 선정·독립 구현 반영; 전체 qualification과 registry 배포는 구분
- Date: 2026-09-14; 기준 commit: `3537152`, npm `1.0.0-alpha.7`
- Goal: WebView 없이 Flutter에서 직접 렌더링하고, npm과 Dart 패키지가 전체 기능을 동일하게 제공하면서 서로의 성능에 영향을 주지 않는다.
- Constraint: 코드는 공유해도, 독립 구현해도 된다. 문서 SSOT와 검증으로 일치하면 된다.
- Recommendation: 기존 TS/PixiJS npm + 독립 Dart engine + CustomPainter/Canvas 집계 렌더러를 채택한다. Flutter에 JS VM이나 Flame을 넣지 않는다. 명세·fixture·conformance를 공유하고 runtime과 배포는 분리한다.

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

## 성능에 따른 최종 선택

[bar 실측](flutter-mobile-benchmark.md)에서 10,000개 전체 높이 변경의 준비 중앙값은 Dart가 Android 2.2–2.5ms, iOS 2.2–2.3ms였다. 측정한 JS 중 가장 빠른 flutter_js buffer는 각각 108.1ms, 23.0ms였다. 전체 갱신은 paired frame 기준으로도 Dart가 우세했다. 10% 갱신의 일부 frame 차이는 중립이지만 대량 갱신에서의 우위를 상쇄하지 않으므로 복수안을 권장하지 않는다.

이 수치는 축 정렬 특화 Dart와 기존 범용 JS geometry·bridge의 비교이며 전체 SDK나 언어 자체의 순위가 아니다. Android profile 에뮬레이터와 iOS debug/JIT 시뮬레이터 결과를 실기기 수치나 60fps 보장으로 확대하지 않는다. 구조는 이 근거로 선정하고 전체 기능·성능은 선택한 구현의 출시 조건으로 검증한다.

| 전략 | 최종 판정 |
| --- | --- |
| 독립 Dart + 직접 Canvas | 채택. 측정한 대량 갱신에 유리하며 상태에서 renderer까지 JS 전달 경계가 없다. |
| TS 코어 + 내장 JS VM | 미채택. 측정한 geometry 재사용 경로의 계산·전달 비용이 크다. wrapper 교체만으로 Dart 우위를 뒤집은 결과는 없었다. |
| JS 의미 처리 + Dart geometry | 미채택. 이 조합은 미측정이므로 느리다고 단정하지 않는다. 재사용 이득보다 고빈도 처리와 상태 소유권을 Dart 안에 두는 선택을 우선한다. |
| Dart 코어의 JS 배포 또는 Rust/WASM 공통 코어 | 미채택. 성능 이득의 측정 근거 없이 기존 npm 코어까지 이전하지 않는다. |
| Flame·SpriteWidget 렌더러 | 미채택. 직접 Canvas 경로를 선정한다. 별도 비교하지 않았으므로 이들이 느리다는 판정은 아니다. |

[JS 대안 조사](flutter-js-runtime-review.md)는 미채택 근거와 재현 정보를 보존한다. 위 대안은 후속 후보 검토 목록이 아니다. 빌드 시 schema·상수·asset 데이터를 공유할 수 있지만 실행 코드는 독립이다.

## Flutter 렌더러

[CustomPainter](https://api.flutter.dev/flutter/rendering/CustomPainter-class.html)와 [Canvas.drawVertices](https://api.flutter.dev/flutter/dart-ui/Canvas/drawVertices.html)의 집계 mesh 경로를 사용한다. 엔티티마다 Widget/Component를 생성하지 않고, 같은 texture라도 paint 순서가 끊기면 batch를 분리한다. bar 외 텍스트·이미지·벡터도 명세에 맞는 Canvas adapter로 구현한다.

controller가 좌표·선택·줄바꿈을 결정하고 renderer는 결과를 그린다. repaint는 하나의 frame 소유자가 예약하며 상시 idle loop와 이중 ticker를 만들지 않는다. 범용 게임 프레임워크의 기본 동작을 제품 규칙으로 사용하지 않는다.

## 독립 구현안 구조

```text
                버전 있는 공개 명세 SSOT
                 /                  \
         TS binding 명세        Dart binding 명세
                |                    |
       기존 TS PatchMap engine   Dart PatchMap engine
                |                    |
           Pixi adapter         Flutter Canvas adapter
                |                    |
        npm: @conalog/patch-map  pub.dev: patch_map
                 \                  /
            공통 conformance 입력·기대 결과
```

동일 저장소의 `packages/patch_map/`에 Flutter package를 관리한다. 기존 npm source/build 위치는 유지하고, Flutter는 별도 디렉터리·pubspec·lock/toolchain·테스트·산출물을 가진다. npm은 Flutter/Dart를 runtime 또는 빌드 의존성으로 요구하지 않고 Flutter는 Node/Pixi를 요구하지 않는다. 공유 schema/fixture/asset 원본은 개발·빌드 입력이며 상대 renderer를 배포물에 포함하지 않는다. 외부 사용자는 각 package manager로만 설치한다.

공통 명세/conformance bundle의 버전/hash를 고정한다. 한 저장소에서 양쪽 변경을 함께 검토하며 문서를 복제해 별도 수정하지 않는다.

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

Flutter는 기존 [performance fixtures](../../performance/fixtures/)와 사용자 제안의 4×25 grid 50/100개, 즉 5,000/10,000 bar workload를 사용하고 component 수를 함께 기록한다. 이번 검증 환경은 사용자 요청에 따라 Android 에뮬레이터와 iOS 시뮬레이터다. 화면·DPR·warmup·빌드 모드를 통제하며 실기기 결과로 확대하지 않는다.

첫 표시·pan/zoom/rotation 입력 지연·frame p50/p95·jank·batch update·text/image 갱신·capture·mount/dispose 메모리·idle CPU/배터리를 측정한다. Dart update/paint 시간 외 Flutter raster/GPU도 본다. frame budget과 [materiality 정책](verification.md)을 사용하고 서로 다른 기기의 FPS로 우열을 결론내리지 않는다. 프레임별 전체 순회·전량 JSON 복사·불필요한 객체 생성·상시 idle loop·이중 ticker를 막는다. 캡처 외 불필요한 readback을 추가하지 않는다.

## 단계별 실행과 출시

폴더·책임·배포 격리와 구현 순서는 [구현 구조](flutter-implementation-plan.md)를 따른다.

| 단계 | 완성 조건 |
| --- | --- |
| T1 명세 기준선 | 전체 export/기능·실패·기본값·binding·시각 기준·지원 플랫폼을 conformance ID에 매핑한다. TS 선언은 TS shape 권위로 유지한다. |
| T2 구조 선정 완료 | 독립 Dart + 직접 Canvas를 선정했다. bar 실험의 수치·범위·제외 사유를 보존한다. |
| T3 선택안 구현 | dataset/geometry -> mutation/history/editor -> interaction/presentation -> assets/text/capture/lifecycle 순으로 계약별 구현·검증한다. 중첩·회전·한글·bar 갱신·입력·PNG를 포함한다. |
| T4 전체 qualification | 공통 conformance, Android 에뮬레이터·iOS 시뮬레이터 통합, 해당 환경의 성능·메모리, 설치 consumer가 모두 통과한다. 빠진 기능은 출시 차단 항목이다. |
| T5 독립 배포 | npm/pub 버전과 contract/hash·통과 capability·지원 플랫폼을 release manifest에 기록하고 실제 설치 결과로 검증한다. |

최초 Flutter 구현 중 npm 유지보수는 계속할 수 있다. 제품 기능 변경은 SSOT와 양쪽 case를 함께 추가한다. 새 기능은 양쪽 구현·검증 완료 후 같은 계약을 지원하는 버전 조합으로 출시한다. 계약을 바꾸지 않는 플랫폼별 최적화·버그 수정은 해당 package만 배포할 수 있다.

현재 [npm publish workflow](../../.github/workflows/publish.yaml)는 branch/manual event를 사용한다. Dart 패키지명은 `patch_map`, 최소 SDK는 Dart 3.11/Flutter 3.41이며 `publish_to: none`으로 게시를 비활성화했다. analyze/test/publish dry-run·패키지 설치·assets/license 포함을 검증한다. 실제 게시 승인 시 [pub.dev OIDC](https://dart.dev/tools/pub/automated-publishing)의 tag 기반 job과 권한을 별도로 설정하며 npm release 경로는 유지한다.

두 registry의 publish는 원자적이지 않다. 한쪽만 성공하면 실제 조합을 release manifest에 남기고 실패한 쪽만 동일 검증 내용으로 재시도한다. pub OIDC 재시도는 원래 tag run을 사용한다. 배포 완료와 기능 동등성 완료를 구분한다.

## 구현과 출시 조건

구조 선택과 독립 구현은 반영했다. 전체 conformance와 이번 Android 에뮬레이터·iOS 시뮬레이터 검증을 출시 판단에 사용한다. SDK·시각 기준·입력 매핑은 [구현 구조](flutter-implementation-plan.md)와 [Flutter binding](../integration/flutter.md)을 따른다. 누락 기능을 허용하는 축소 출시는 하지 않는다. 추가 플랫폼은 이번 필수 지원 범위에 포함하지 않는다.
