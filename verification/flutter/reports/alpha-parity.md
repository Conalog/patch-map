# Flutter v1 alpha 기능 정합성 검토

2026-09-15. 기준은 현재 `release/1.0` 계열 npm `1.0.0-alpha.7`이며
`main`은 참조하지 않았다. npm production 코드는 수정하지 않았다.
Flutter는 직접 Canvas 구조를 유지하며 Android/iOS 앱을 대상으로 한다.
사용자 결정에 따라 Flutter 웹 전용 로더, 압축 의존성, DOM 이벤트 및
JavaScript 비교 브리지는 제거했다. npm은 브라우저, Flutter는 네이티브
에뮬레이터/시뮬레이터에서 같은 fixture와 명령으로 확인한다.

## 검토 범위와 보완

공개 TypeScript 선언 inventory 865개와 공통 의미 요구사항 72개를 기준으로
engine, geometry/rendering, host/assets를 독립 리뷰했다. 정적 inventory의
개수 자체가 모든 입력의 실행 증거는 아니다. 실행 case는
`conformance/manifest.json`과 `conformance/witnesses.json`에서 연결한다.

| 영역 | 확인 및 보완 |
| --- | --- |
| 데이터·대상 | 모든 root/component 종류, 정규화·직렬화·hash, stable ID/query/stale target을 기존 공통 trace로 확인. 잘못된 타입과 공백뿐인 ID/query 거부를 보완 |
| 갱신·transaction | concrete component patch를 공통 schema로 정규화. scalar size의 폭 유지, 잘못된 값·중복 shorthand·혼합 대상 batch의 원자적 거부, bar/icon source의 원자적 교체와 기본값 복원 |
| history | 애니메이션 중/완료 후 Undo가 오래된 bar 높이를 남기지 않도록 수락 시점에 tween과 렌더 후보를 함께 조정. listener에 확정 상태 전달 |
| presentation | 요청 수와 무시된 대상의 accounting, 명시 paint와 key 검증, overlay null 복원. 숫자·문자열 %·value/unit scalar의 bar 높이 복원 및 애니메이션 시작값 보완 |
| editor | grid/relation/text/delete/mode 기존 trace 확인. unchanged 결과를 유지하고 편집 모드에서 일반 클릭·박스 선택이 상태를 침범하지 않도록 수정 |
| viewport·회전 | fit contributor 순서, 숨김·root image/relation 제외, 중복·컴포넌트 대상, XYWH bounds를 alpha와 일치. replacement fit 전체 사전 검증. 잘못된 요청과 empty fit이 진행 중 rotation을 취소하지 않도록 수정 |
| 정방향 보기·기하 | signed scale, authored/map rotation, upright/follow-item, 다회전·경로 선택, transform preview/commit/cancel을 확인. 동등 각도의 불필요한 settled 이벤트 제거, background에서 rotation 일시정지·복귀 |
| bar 렌더 | npm alpha와 같이 bar source border는 그리지 않고 숫자 radius만 적용. background와 standalone rect는 각자의 규칙 유지 |
| 입력·선택 | 단일 선택 box, 조상 잠금, dataset 교체 시 동일 ID press/pin 초기화, focus 상실 정리, trackpad 누적 delta 처리. predicate 예외에도 marquee 정리 |
| text | grapheme/bidi/wrap/overflow/autoFont 및 text projection 기존 테스트 확인. scalar margin 등 concrete patch 정규화 보완 |
| assets | SVG parser/MIME 양방향 일치와 요청 크기의 실제 picture 적용. PNG/JPEG/WebP/GIF/SVG/AVIF 및 TTF/OTF/WOFF/WOFF2 네이티브 decode·capture 검사 |
| capture·수명 | capture 동안 animation clock 정지 및 남은 시간 재개, resize 순서 유지. destroy 동시 호출 합류, surface 실패 후에도 asset 정리 시도, 실패한 정리만 재시도 |
| 접근성·진단 | Semantics 활성화의 일반 selection과 실제 pointer event를 분리. reduced motion, callback 격리, native 진단과 다중 인스턴스 정리 확인 |

hot path에는 새 renderer나 별도 state coordinator를 만들지 않았다. bar
animation은 기존 typed columns를 샘플링하고, 부분 retarget은 geometry
topology를 공유한다. box eligibility는 target마다 전체 snapshot을 생성하지
않고 조상 잠금만 확인한다. 회귀 테스트로 이 두 경로를 고정했다.

## 실행 증거

- Dart analyze 통과. 전체 테스트 192개 통과, opt-in CPU profile 1개 제외.
  profile 제외는 별도 네이티브 성능 측정으로 대체했고 기능 case를 skip하지 않았다.
- npm 브라우저/Dart VM 공통 10개 fixture, 177개 명령 비교 통과.
  `alpha-parity`의 계산된 viewport/fit 좌표만 절대 오차 1e-9를 허용한다.
  실제 최대 차이는 약 1.14e-13이며 데이터·hash·ID·상태·개수는 정확 비교한다.
- Android API 34 arm64 에뮬레이터 profile/AOT에서 native contract와 실제
  비교 데모 통과. gallery/updates/editor/alpha-parity의 27개 UI 명령 및
  0°/90° capture를 실행했다. npm trace와 authored data/hash, selection,
  history, editor, viewport, rotation을 대조했다.
- iPhone 15 / iOS 17.2 시뮬레이터 debug/JIT에서 native contract와 같은
  데모 27개 명령 통과. debug 실행은 기능 증거이며 AOT 성능 증거가 아니다.
- 분리 설치한 Dart artifact consumer가 공개 entry, assets, unattached
  refusal, destroy를 통과했다. registry 배포는 수행하지 않았다.

현재 실행 원문은 ignored `.artifacts/flutter/alpha-parity-*.json`,
`.artifacts/flutter/public-ci/`, `.artifacts/performance/alpha-parity/`에 있다.
공개 inventory/fixture 검증과 모바일 실행을 함께 사용하며, mock surface
또는 작은 demo만으로 출시 qualification 전체가 완료됐다고 판단하지 않는다.

## 네이티브 성능 비교

기준 production source는 `590407f3`, 최종 candidate는 `cc8cf8db`이다.
[소스·원문 식별 정보](alpha-parity-sources.json)에 파일별 해시를 기록했다. 같은 example/harness에 baseline 또는
candidate package 경로를 연결하고 `flutter drive --no-pub --profile`로 실행했다.
baseline lib는 해당 Git commit과 byte 일치하고 candidate 및 harness SHA-256,
호출 인자와 package 경로는 source manifest에 보존했다. 매 실행 후 package
설정을 복원했다. 빌드·브라우저 조작·다른 테스트는 측정과 겹치지 않았다.

Android API 34 `Pixel_6a_API_34`, SwiftShader 소프트웨어 GPU, DPR 2.625,
60Hz, 앱 surface physical size 1080×2337. bar는 360×640 logical map,
카메라 center `[675,1100]`, scale `360/1350`을 고정했다. 50/100 grids ×
4×25 bars, case별 warmup 5회와 측정 20회, 순서를 뒤집은 2개 block을 실행했다.
text는 실제 서비스 50 groups × 5×20 panels의 full-height bar/text demo,
warmup 5회와 측정 20회다. seed와 입력 생성은 기존 benchmark 규약을 따른다.

첫 비교의 중앙값(ms):

| 작업 | commit 전→후 | 다음 publication 전→후 | 최종 publication 전→후 |
| --- | --- | --- | --- |
| 5,000 bars 즉시 | 14.852→12.630 | 65.898→56.728 | 65.899→56.730 |
| 5,000 bars animation | 8.729→12.198 | 62.688→59.181 | 271.474→267.408 |
| 10,000 bars 즉시 | 25.595→26.883 | 94.982→97.884 | 94.983→97.886 |
| 10,000 bars animation | 21.858→20.261 | 113.659→110.237 | 320.839→328.111 |
| 5,000 panel text | 208.327→208.529 | 309.029→296.368 | 같은 단일 publication |

animation 완료에는 의도된 200ms duration이 포함된다. publication은 앱이
확인한 새 frame이지 GPU 완료 시각이 아니며, build/raster FrameTiming은 별도로
기록했다. 중앙값과 tail은 혼재한다. 10,000 animation 완료 p95는
386.018→404.159ms이고 block별 중앙값 차이는 −1.558/+25.468ms로 일정하지 않다.
text 첫 비교의 최악 commit은 246.520→459.483ms, publication은
345.192→571.065ms였다. 한 번의 긴 지연도 결과에서 제외하지 않았다.

요약 p95는 정렬 후 nearest-rank `ceil(n×0.95)−1` 인덱스를 사용한다.
bar harness 내장 요약의 `ceil((n−1)×p)`와 다르므로 여기서는 raw rows로 다시
계산했다. text 원문의 physicalSize 문자열은 수치가 아니므로 화면 크기는
같은 emulator의 bar 기록과 실행 조건에 의존한다. text의 DPR와 실제 logical
viewport는 두 실행에서 일치한다. 소프트웨어 GPU 결과는 실기기 FPS, npm과의
속도 동등성 또는 보편적인 성능 개선의 근거로 사용하지 않는다.


text의 긴 지연을 확인하기 위해 순서를 baseline→candidate로 바꿔 20회씩
추가 측정했다. commit 중앙값은 213.416→218.602ms, publication 중앙값은
298.474→312.487ms였다. 최대 publication은 341.880→545.406ms로 candidate의
긴 지연이 다시 관찰됐다. 코드 원인으로 단정하지 않지만 성능 동등/회귀 없음의
근거로도 사용할 수 없다. batch admission의 중복 대상 순회를 기존 검증 루프로
합친 뒤 최종 candidate를 별도 측정했다. 앞선 불리한 결과도 모두 보존한다.


최종 candidate의 commit / 다음 publication / 최종 publication 중앙값(ms):

| 작업 | commit | 다음 publication | 최종 publication |
| --- | --- | --- | --- |
| 5,000 bars 즉시 | 11.598 | 61.168 | 61.169 |
| 5,000 bars animation | 11.771 | 58.200 | 273.065 |
| 10,000 bars 즉시 | 27.213 | 101.091 | 101.091 |
| 10,000 bars animation | 22.476 | 108.596 | 308.596 |
| 5,000 panel text | 214.778 | 311.242 | 같은 단일 publication |

최종 text의 publication p95/max는 344.640/366.727ms로 앞선 500ms대 지연은
이번 20회에서는 재현되지 않았다. 최종 10,000 animation 완료 p95/max는
390.842/437.586ms이다. 중복 순회 제거와 장시간 tail 개선의 인과관계를 이
표본만으로 확정하지 않는다. 이번 변경은 기능 정합성 보완으로 판정하며,
성능 향상·동등성·지속 60FPS를 보증하지 않는다. 사용자 결정에 따라 Flutter 웹을 지원 범위에서 제외하고 직접 Canvas의 네이티브 구현을 유지한다.
