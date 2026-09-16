# Android 실기기 기능 실험실 검증

2026-09-16, 코드 커밋 `15681fa03c8cb424eb946302adda49f71387b91b`의
Flutter 기능 실험실을 Galaxy S25+ (`SM-S936N`, Android 16 / API 36)에서
profile 모드로 검증했다. Flutter 3.41.4, Dart 3.11.1, 화면 1440 × 3120,
Flutter DPR 3.75 환경이다. 이번 검증에서 SDK나 데모 소스는 수정하지 않았다.

## 결과

| 경로 | 확인 내용 | 결과 |
| --- | --- | --- |
| `feature_lab_test.dart` | 21개 장면 로드와 총 218개 명령의 결과·불변식 | 통과 |
| 서비스 데이터 | 5 × 20 패널 50그룹, 전체 Bar 높이·Text 값, 데이터 없음·통신·오류 상태 | 통과 |
| 기능 실험실 조작 | 뷰 분리 중 작업 차단, 재연결, 회전, 두 번째 맵 생성·제거, 캡처 다이얼로그 | 통과 |
| `native_contract_test.dart` | 터치 선택·Semantics 상태, Undo/Redo, 두 포인터 핀치 확대 | 통과 |
| 네이티브 에셋 | PNG·JPEG·WebP·GIF·SVG·AVIF, TTF·OTF·WOFF·WOFF2의 캡처 픽셀 확인 | 통과, 에셋 실패 0 |
| 캡처·수명주기 | 논리 크기 및 DPR에 맞는 PNG, binding pause/resume, destroy 후 독립 맵 재생성 | 통과 |
| 일반 앱의 adb 입력 | 전체 Text 반복 변경, 패널 선택, 빈 캔버스 드래그 | 통과 |
| OS Home → 앱 복귀 | 동일 프로세스·선택·이동 상태 유지, 복귀 후 전체 Bar 변경 | 통과 |

21개 장면 중 자동 명령이 없는 장면도 있다. 218개는 실행한 명령 수이며,
전체 체크리스트의 모든 항목을 독립적으로 수동 검증했다는 뜻은 아니다.
서비스 데이터는 patch-service 생성·표시 형식을 참고한 예제 배치와 측정값이다.

일반 앱에서는 Text 모드 진입 후 반복 갱신의 `appliedCount: 5000`을 확인했다.
드래그 전후 `g0.0.0`의 UI bounds가 `[192,869][240,966]`에서
`[422,969][470,1066]`으로 이동했다. 이후 패널 선택, OS 홈 진입과 앱 복귀를
실행해 같은 선택·위치가 유지됨을 확인했다. 복귀 후 Bar 변경은 `committed`였다.
일반 앱의 수집된 로그에는 Flutter 미처리 예외, `FATAL EXCEPTION`, ANR 기록이
없었다. 마지막에는 첫 그룹을 보는 일반 데모를 실행한 상태로 두었다.

## 재실행과 증거

`packages/flutter/example`에서 연결된 Android 기기의 ID를 `DEVICE_ID`에 지정한다.

```sh
PATCHMAP_CONTRACT_OUTPUT=/tmp/patchmap-android-lab.json flutter drive --no-pub --profile -d "$DEVICE_ID" --driver=test_driver/native_contract_driver.dart --target=integration_test/feature_lab_test.dart
PATCHMAP_CONTRACT_OUTPUT=/tmp/patchmap-android-native.json flutter drive --no-pub --profile -d "$DEVICE_ID" --dart-define=PATCHMAP_REVISION=15681fa03c8cb424eb946302adda49f71387b91b --driver=test_driver/native_contract_driver.dart --target=integration_test/native_contract_test.dart
flutter run --no-pub --profile -d "$DEVICE_ID" --target=lib/main.dart
```

현재 실행의 원시 산출물은 Git에서 제외된
`.artifacts/flutter/feature-lab/android-device/`에 있다.
`lab.json`, `native-contract.json`, 실행 로그, 단계별 UI XML·스크린샷,
빌드별 APK SHA-256, 코드 리비전, 기기 빌드와 Flutter 버전을 보관했다.
원시 파일과 APK 자체는 이 문서 커밋에 포함하지 않는다.

이 검증은 기능 확인이다. FPS·프레임 지연·발열을 통제해 측정한 성능 실험이
아니므로 60 FPS 충족이나 npm 대비 성능 동등성을 판정하지 않는다.
핀치 검증은 실기기에서 Flutter 통합 테스트가 주입한 포인터 입력이며,
OS Home/복귀는 별도로 adb로 실행했다. 접근성 서비스 전체 동작,
프로세스 강제 종료 후 복구, 장시간 안정성은 이번 범위에 포함하지 않는다.
