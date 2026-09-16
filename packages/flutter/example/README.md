# PatchMap Flutter examples

Run from this directory with Flutter 3.41.4.

## Interactive 5,000-panel service demo

```sh
flutter run --profile -d DEVICE_ID --target=lib/bar_demo.dart
```

The shared input is `conformance/scenes/panel-groups.json`: 50 panelGroups,
5 rows × 20 columns each, using the real `patch-service` editor template merged
with its dashboard `panelInitialState`. Panels are 40 × 80 with padding 3,
gap 4, white rounded background, dark border, tinted bar and centered auto-size
text. The hidden loading icon is retained. Source revision and paths are recorded
in the JSON; stable component IDs and deterministic group placement are demo
adaptations. No private plant data is included.

- **Bar 높이**: `bar.show: true`, `text.show: false`. The button changes all
  5,000 heights to different values in 1–100% of the 74-unit content height.
  The animation switch uses the package's default 200 ms transition.
- **Text 값**: `bar.show: true` at 100%, `text.show: true`. The button changes
  only the 5,000 text values (1–9,999), each different from its previous value.
  Height animation is disabled in this mode. Switching back restores the last
  chart heights; switching to text restores its last values.

Both modes keep the same scene and camera, use one `updateBatch` per click,
and disable history. The mode transition updates both component kinds; its
applied count can be 10,000 component changes across 5,000 panels.

The npm counterpart uses the same JSON and seeded update sequence:

```sh
# From the repository root
npm run verify:conformance:serve
```

Open `http://127.0.0.1:5173/verification/conformance/web/panels.html`.
Reload each app to reset the seed. After editing the JSON, run
`node verification/flutter/prepare-fixtures.mjs` before restarting Flutter.
The generated Dart input is verified by `verification/flutter/package.mjs`.

Focused native demo regression check (from this directory):

```sh
flutter test test/panel_demo_test.dart
```

Drag anywhere on the map to pan. Pinch to zoom, or use the zoom buttons.
**전체 보기** fits all grids to the available screen. The footer shows the
applied count; the camera label updates after movement settles. Rendering uses
`PatchMapView` directly, without an enclosing scroll view or per-bar Widgets.

To prepare an ARM64 Android APK without a connected device:

```sh
flutter build apk --profile --target-platform android-arm64 --target=lib/bar_demo.dart
```

Output: `build/app/outputs/flutter-apk/app-profile.apk`.

## Shared contract comparison

```sh
flutter run -d DEVICE_ID --target=lib/main.dart
```

This opens the service-derived 5,000-panel blueprint first, with separate service and regression scenarios. The matching npm
comparison is served by `verification/conformance/vite.config.ts` at the
repository root. The Reset buttons restore the same random seed.

## 전체 기능 실험실

```sh
# 저장소 루트
npm run flutter:lab -- -d DEVICE_ID
npm run verify:conformance:serve
```

npm 웹: `http://127.0.0.1:5173/verification/conformance/web/lab.html`
(포트가 사용 중이면 Vite가 출력한 포트를 사용합니다.) Flutter는 Android/iOS
앱으로 실행하며 Flutter 웹은 사용하지 않습니다.

같은 `conformance/scenes/feature-lab.json`을 사용합니다. 기본 화면은 서비스 기반
5,000-panel blueprint이며, 서비스 시나리오 6개와 별도 회귀 화면 15개를 제공합니다.
회귀 화면은 다음 기능을 작게 분리한 입력입니다:
전체 요소, 변경·Undo·오버레이, 기본 편집, 편집 충돌·취소·삭제,
조회·표시 레이어·화면, 이동·크기·회전 편집, 구조 변경·트랜잭션,
옵션·콜백·재진입, 회전·정방향·반전, 이미지·폰트, bar 애니메이션,
Unicode·줄바꿈, 선택·제스처, 캡처·생성·해제, 접근성입니다.

- **조작**: 높이·텍스트·각도 변경, Undo/Redo, 확대·이동·fit, 선택 정책,
  PNG 미리보기, 빈 데이터, 독립 맵 생성·해제. 앱은 뷰 분리·재연결도 제공합니다.
  자유 조작 후 시나리오를 다시 검증하려면 **Reset**을 누르세요.
- **시나리오**: 177개 기존 공통 명령, 10개 텍스트·애니메이션 명령, 31개 서비스 명령을
  한 단계씩 또는 남은 단계 전체로 실행합니다. **여기까지 재현**은 초기화하고
  선행 명령을 함께 실행하므로 조회·편집 세션 참조를 보존합니다.
  의도한 거절은 기대값과 일치하면 성공이며 예상 밖 실패는 진행을 멈춥니다.
- **상태·기록**: 원본 데이터, hash, 선택, history, editor, viewport, 회전,
  최근 hover·포인터 선택·tooltip, 진단과 최근 100개 실행 기록을 확인합니다.
  웹은 JSON 다운로드, 앱은 복사를 제공합니다. 매 프레임 조회하지 않습니다.
- **전체 체크리스트**: `conformance/manifest.json`의 72개 요구사항과 실제
  테스트 위치를 그대로 표시합니다. 자동 테스트 실행 버튼은 아닙니다.
  네트워크 정책 실패·정리 경쟁·모든 옵션 조합은 기존 회귀 테스트의 범위입니다.
  접근성은 VoiceOver/TalkBack, 배경 전환은 OS 홈 이동, 모션 감소는 OS 설정을
  이용해 수동으로 확인합니다. 실행한 것처럼 자동으로 통과 표시하지 않습니다.

직접 JSON 명령도 실행할 수 있습니다. 시나리오의 입력을 복사해 값을 바꾸거나
`{"id":"custom","op":"rotation.set","input":45}`부터 시작하세요.
대상이 없는 장면에서 텍스트·bar 명령은 정상적인 입력 거절로 표시됩니다.

UI 회귀 확인:

```sh
# 웹 서버를 켠 후 저장소 루트에서
PATCHMAP_DEMO_URL=http://127.0.0.1:5173 node verification/conformance/feature-lab-smoke.mjs
# 이 디렉터리에서
PATCHMAP_CONTRACT_OUTPUT=/absolute/path/native-lab.json flutter drive \
  -d DEVICE_ID --driver=test_driver/native_contract_driver.dart \
  --target=integration_test/feature_lab_test.dart
```

브라우저 검사는 21개 시나리오의 단계, 자유 조작, 독립 맵, PNG 미리보기를
실행합니다. 네이티브 검사도 실제 Canvas 위에서 21개 시나리오와 분리 상태의
조작 거절·재연결·독립 맵·캡처를 실행합니다. 성능 주장은 하지 않습니다.

### 서비스 데이터 출처

`conformance/scenes/service-blueprint.json`은 `panel-groups.json`을 바탕으로
`node verification/conformance/service-demo.mjs`로 생성합니다. 변경 후
`node verification/flutter/prepare-fixtures.mjs`를 실행해 Dart 입력을 갱신합니다.

참조한 서비스 revision은 `e6e3e00937bc5dad9b95ea1a0d01b18a1f74cd17`입니다.
`toolbar-panel-group-tool.js`, `toolbar-item-tool.js`, `toolbar-text-tool.js`,
`toolbar-rect-tool.js`, dashboard `initial-state.js`·`common-state.js`,
`patchmap-assets.js`의 형태·상태를 반영했습니다. 원본 경로는 scene provenance에
기록합니다. `cloudAlert`는 서비스의 `static/icons/cloud-alert.svg` 원본을 복사해
등록합니다. 인버터·접속함은 서비스의 환경별 HTTP URL 대신 패키지 SVG alias를
사용합니다. 배치·ID·레이블·측정값은 합성 예제이며 실제 고객 발전소 데이터가 아닙니다.

처음에는 첫 panelGroup·장치만 확대해 보여줍니다. **전체 보기**는 50그룹,
**첫 그룹**은 확대 상태로 돌아갑니다. **전체 Bar 높이**, **전체 Text 값**,
**데이터 없음**, **통신 상태**, **오류 상태**는 전체 5,000개 패널에 적용됩니다.
Text 모드로 처음 전환할 때만 bar를 100%로 채우고 icon을 숨깁니다. 같은 모드에서
다시 누르면 text 값만 갱신합니다. Bar도 같은 모드에서는 높이 열만 갱신합니다.
다른 명령을 실행하면 모드를 다시 확인하도록 전환 경로를 사용합니다.
