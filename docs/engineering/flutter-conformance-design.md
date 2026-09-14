# Flutter conformance design

- Status: proposed; [Flutter package design](flutter-package-design.md)의 동일성 검증 설계
- Goal: 코드 공유 여부와 무관하게 전체 기능 일치를 검증하고 플랫폼별 최적화를 허용한다.

## SSOT와 권위

| 내용 | 단일 권위 | 검증 |
| --- | --- | --- |
| 기능 의미·기본값·순서·실패·불변조건 | 기존 owning public API 문서의 공통 계약 | ID별 JS/Dart conformance |
| 공통 저장 데이터·명령 fixture의 wire shape | 버전 있는 언어 중립 schema | validation·strict round-trip |
| npm의 정확한 API/타입·JS 고유 입력 규칙 | exported TypeScript 선언 | 기존 declaration/packed consumer 검사 |
| Dart의 정확한 API/타입·nullability | exported Dart 선언 | analyze·Dart consumer 검사 |
| 플랫폼 대응 | 각 기능 문서가 링크하는 binding 명세 | API mapping·native/browser 통합 검사 |
| 지원 선언 | contract revision·required capability·플랫폼별 qualification manifest | 두 artifact의 통과 결과·내용 fingerprint |

기존 문서를 공통 계약과 웹 binding으로 구분하고 Dart binding을 연결한다. 규칙을 복제하거나 약화하지 않는다. JSON schema는 TS 타입 권위를 대체하지 않는다. 전환 시 [AGENTS.md](../../AGENTS.md) 라우팅도 갱신한다.

규칙별 stable ID와 fixture expected/invariant를 리뷰한다. schema는 shape, trace는 순서·실패, integration은 실제 입력·표시를 검증한다. 생성 도구는 type·상수·Unicode 표만 다루고 loop/자료구조를 강제하지 않는다.

## 전체 기능 inventory

구현 시 모든 public member·옵션·기본값·element/component kind를 세부 ID로 확장한다. 각 ID는 명세 위치·JS API·Dart API·양쪽 test ID·플랫폼 관측값을 가진다. exported API에 대응 ID가 없거나 필수 ID가 skipped면 동일 기능 qualification을 실패시킨다.

| 공통 domain | 반드시 포함할 범위 | 현재 owning 문서 |
| --- | --- | --- |
| mount/destroy | readiness, empty scene, resize, 다중 인스턴스, 정리 | [Getting started](../getting-started.md) |
| data/targets | 전체 element/component, 정규화, ID/query, serialize, hash, theme | [Data](../api/data-and-targets.md) |
| update/batch/transaction | 모든 operation, typed columns, 원자적 거절, 4가지 status | [Mutations](../api/mutations-and-history.md) |
| history | undo/redo, companion/selection, actionId, limit, refused restoration | [Mutations](../api/mutations-and-history.md) |
| editor | grid/relation/text/delete와 중간 모드·충돌·확인 | [Editor](../api/editor-workflows.md) |
| pointer/selection | hover/click/context menu, 정책, target, box, gesture cancel | [Pointer](../api/pointer-and-selection.md) |
| transform | move/resize/rotate, preview/edgePan/commit/cancel | [Viewport](../api/viewport-and-transform.md) |
| viewport/rotation | fit/reset/restore, anchoring, settle, multi-turn, animateTo | [Viewport](../api/viewport-and-transform.md) |
| presentation | transient overlay, keyed/grid, bar animation, history 구분 | [Presentation](../api/presentation.md) |
| text | grapheme/bidi/wrap/autoFont/lineHeight/overflow, font readiness | [Text](../api/text.md) |
| assets/capture | 모든 입력 형식, admission, leases, 교체, exact-tuple PNG | [Assets](../api/assets-and-capture.md) |
| host/diagnostics/accessibility | focus/activation, reduced motion, errors, disposer | [Host](../integration/host.md) |

Flutter의 이름·표현은 Dart답게 정할 수 있지만 의미를 없애면 안 된다. 예를 들어 `updateBatch` 결과의 committed/unchanged/rejected/refused 구분과 동기 결정은 유지한다. Flutter에서 전 API를 Future/Stream으로 바꾸면 callback 관측 순서가 달라질 수 있으므로 각 binding 계약으로 검증한다. listener 반환 disposer에 대응하는 해제 기능이 있어야 한다.

## 공통 trace와 비교

```text
versioned dataset + command + input + virtual time + asset/frame faults
            |                                  |
       JS public runner                  Dart public runner
            |                                  |
       observation trace                 observation trace
            +---------------+------------------+
                            |
             명세 expected + invariants + 상호 비교
                            |
             플랫폼별 rendering/input/accessibility 검사
```

예시 trace는 load -> target query -> updateBatch -> change callback 재진입 -> transaction 거절 -> undo -> capture 중 resize -> destroy 순서를 수행한다. 명령 직후 결과와 callback 순서, 각 checkpoint의 data/hash/history/selection/geometry/published state를 기록한다. 재진입은 JSON 안에 함수 코드를 저장하지 않고 양쪽 runner가 같은 named action을 실행하게 한다.

- 정확히 비교: stable ID, persisted 데이터, semanticHash, result status/code, 선택, history/companion, 기본값, 명세상 이벤트 순서.
- 수치 규약: UTF-16/code point/grapheme 구분, 정수 범위, overflow, 색상 packing, 정렬 tie, serialization/key 순서를 명시한다. missing과 null을 구분하고 JS accessor/undefined 수용 규칙은 JS binding에서 검증한다.
- 기하 비교: layout/hit-test 기준은 동일해야 한다. 부동소수 오차는 필드별 명시적 허용범위 안에서만 인정하며 target 선택이나 hash가 바뀌는 차이를 허용하지 않는다.
- 비동기 비교: 가상 clock·명시적 frame/asset settlement에서 의미 순서를 비교한다. 실기기 wall-clock·GPU frame 수·backend별 debug 수치가 같아야 한다고 요구하지 않는다.
- oracle: 기존 TS 실행 결과는 차이를 찾는 근거다. 문서와 불일치하면 명세/TS/Dart 중 오류를 판정하며 TS 버그를 정답으로 복제하지 않는다.
- 속성 검사: serialize/load round-trip, 성공 transaction 후 undo 복원, rejected/refused의 무변경, cancel의 history 불변을 공통 seed로 검사한다. 실패 seed는 고정 회귀 fixture가 된다.

## 플랫폼 대응에서 숨기면 안 되는 차이

| 위험 | 필요한 동작·검사 |
| --- | --- |
| 텍스트 | Dart에 현재 semantic segmentation/layout 규칙을 구현한다. Flame TextBox/TextPainter의 기본 줄바꿈으로 대체하지 않는다. Latin·한글·emoji·RTL·ligature·weights·zoom별 잘림/배치 검사를 둔다. |
| font fallback | FiraCode에 한글 glyph가 없고 현재 계약은 browser fallback이다. 고정 fallback font 도입 여부를 결정하고, 시각 tolerance는 raster 차이에 한정한다. 공통 font 원본에서 포맷별 산출물을 만들면 provenance·metric 일치를 검증한다. |
| 이미지/font 형식 | SVG·PNG·JPEG·WebP·AVIF·GIF·WOFF/WOFF2·TTF/OTF 등 현재 admission 전체를 목표 OS에서 검사한다. Flutter 기본 codec이 모든 형식을 처리한다고 가정하지 않는다. 필요한 decoder가 없으면 출시 차단이다. |
| 네트워크 | 기존 anonymous fetch·redirect 거부·MIME·size·SVG 정책을 유지한다. native loader의 기본 redirect나 전역 cache hit로 정책을 우회하지 않는다. CORS 같은 웹 제약은 플랫폼 binding에 남긴다. |
| 입력 | CSS/logical px와 DPR, 회전 좌표, drag 바깥 이동, cancel, parent scroll gesture 경쟁, keyboard/modifier, pointer device, pinch/long-press 대응을 실기기에서 검사한다. |
| 접근성 | Flutter Semantics로 논리 focus 순서·label·activation·selection·reduced motion을 검증한다. DOM node 수나 엔티티별 Widget 구조를 복제할 필요는 없다. |
| capture | visible-readiness와 동일 published tuple을 보존한다. PNG dataUrl은 양쪽 제공 가능하며 byte 편의 API 추가 시 binding에 명시한다. stale 장면·부분 decode 결과를 성공으로 반환하지 않는다. |

브라우저 전용 backend/devtools 옵션과 Flutter surface 정보는 정확한 플랫폼 사실을 반환한다. 동일 기능 판정을 위해 진단 정보를 조작하거나 unsupported 기능을 capability=false로 숨기지 않는다. 새로운 플랫폼 의미가 필요하면 owning 계약에서 명시적으로 결정한다. [Flutter codec 문서](https://api.flutter.dev/flutter/dart-ui/instantiateImageCodec.html)는 AVIF를 보장 목록에 포함하지 않으므로 별도 qualification이 필요하다.

## 오류와 수명 검사

| 실패 주입 | 기대 결과 | 검사 계층 |
| --- | --- | --- |
| 중간 invalid operation/missing target | 전체 거절, scene/history/selection 불변 | 공통 trace |
| callback throw/reentry 또는 refused undo | 정의된 진단, stale commit 없음, 잘못된 history 전진 없음 | 공통 trace + platform binding |
| asset A 후 B 요청, A가 늦게 완료 | A 재부착 없음; B 실패면 기존 resolved texture 유지 | trace + 실제 decoder |
| capture 중 resize/destroy/renderer 실패 | resize 순서와 명세상 실패, 다른 tuple PNG 반환 금지 | 플랫폼 통합 |
| 애니메이션 도중 background/reduced motion/취소 | 정의된 진행·정지·완료 순서, settled·history 보존 | 가상 clock + 실기기 |
| 반복 mount/unmount, 다중 map 공유 assets | 인스턴스 간 해제 침범·늦은 재부착·listener/ticker/lease 누수 없음 | lifecycle + memory |

Dart runner는 미구현이며 위 gate는 미검증이다. [기존 집중 테스트](system-map.md)를 JS 근거로 사용하고 [verification 정책](verification.md)에 따라 변경 위험에 맞게 확장한다.

## 유지보수와 배포 규칙

1. 기능 변경은 owning 명세·contract revision·ID/fixture를 먼저 갱신한다. 기대 결과 변경에는 동작 변경 이유를 기록한다.
2. TS와 Dart가 각자 구현하며 공통 trace와 플랫폼별 검증을 통과한다. 플랫폼 최적화는 공통 성능 수치나 내부 구조를 강제하지 않는다.
3. release manifest는 npm version, pub version, spec revision, conformance hash, assets provenance, required capabilities, qualified platforms를 대응시킨다. manifest는 CI 결과에서 생성하고 수기로 통과 표시하지 않는다.
4. 같은 spec이라도 필수 case가 누락·skip·실패하면 동일 기능 상태가 아니다. adapter가 빈 결과를 반환해 case를 통과시키는 일을 막도록 실제 public API와 플랫폼 integration을 검사한다.
5. 패키지별 bug/performance patch는 독립 배포 가능하다. 공통 버그는 같은 회귀 ID로 양쪽 영향 여부를 확인한다. 새로운 기능은 양쪽 준비 상태를 명확히 표시한다.
6. docs만 갱신됐거나 실제 artifact에 반영되지 않은 상태를 막기 위해 npm packed consumer와 Dart package consumer에서 같은 contract fingerprint를 확인한다. 릴리스 시 두 registry의 조회·설치 결과를 기록한다.

테스트만으로 모든 입력의 동등성을 증명하지는 못한다. inventory·경계/실패 trace·속성/renderer 검사·변경 리뷰로 drift를 발견하고 출시에서 차단한다.
