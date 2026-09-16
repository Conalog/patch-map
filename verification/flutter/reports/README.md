# Flutter 검증 보고서

- [v1 alpha 기능 정합성](alpha-parity.md): npm 브라우저와 Android/iOS 앱,
  native Canvas 변경 전후 성능 및 검증 한계.
- [Android 실기기 기능 실험실 검증](android-feature-lab.md): 서비스 5,000개 패널,
  21개 시나리오, 네이티브 입력·에셋·캡처 및 OS 복귀 확인.
- [10,000개 텍스트·아이콘 갱신 최적화](panel-10000-optimization.md): Android
  에뮬레이터에서 여섯 후보와 최종 조합을 검증했다. 갱신 지연은 개선됐지만
  100ms·60fps 목표는 미달하며 텍스트 프레임 비용은 증가했다.

## Canvas / Flame 비교 결과 기록

직접 Canvas를 유지하기로 결정한 Android 실기기 비교 기록이다. 5,000개와
10,000개 서비스 패널에서 bar 높이 변경과 text 변경을 비교했다. Flame을
도입할 뚜렷한 전체 성능 이득은 확인되지 않았으며, 전체 보기의 프레임 비용과
새 텍스트 갱신 지연은 두 방식 모두 개선이 필요했다. 제한된 장면의 결과이므로
전체 SDK, npm 또는 iOS 성능 동등성을 입증하지 않는다.

- [5,000개 결과 보고서](canvas-flame-5000.md): 주 비교 48개 케이스·960개 측정,
  보조 비교 26개 케이스·460개 측정.
- [10,000개 결과 보고서](canvas-flame-10000.md): 48개 케이스·960개 측정.
- `final-primary-sources.json`, `final-supplement-sources.json`,
  `scale10k-sources.json`: 측정 입력의 파일별 SHA-256, 빌드 설정 및 APK 식별 정보.

## Git 보존 범위

- `8dbee17b`: 5,000개 비교 구현과 프로토콜.
- `ad0dee34`: 10,000개 비교 구성.
- `15cbbd12`: native surface 준비 후 측정을 시작하는 수정.
- `6701df7e`: 10,000개 판정 문서. 10,000개 manifest의 63개 소스 파일은 이
  커밋과 모두 일치한다.
- 보고서 보존 커밋 `0a51d765`는 이전 커밋에 원문 그대로 없던 5,000개 주 비교의
  `host.dart`와 `renderer_comparison_supplement_test.dart` 두 중간 소스도
  `0a51d765:verification/flutter/renderer-comparison-snapshots/`에 기록한다. 다른 측정
  소스는 기존 Git 이력에 있으며 manifest의 해시로 대조할 수 있다.

보고서 보존 이후 별도 커밋으로 삭제했다. 최종 작업 트리에는 결과
보고서와 소스 식별 정보만 남기고, 비교용 Canvas/Flame 프로토타입·실행 도구·
전용 테스트·중간 소스 사본·로컬 APK와 원시 실행 산출물은 삭제했다. 측정
소스와 프로토콜이 필요하면 Git의 해당 커밋에서 열람한다. APK와 원시 행
파일 자체는 Git에 넣지 않으므로 해시만으로 원본 APK/원시 측정을 복원할 수
있다는 의미는 아니다. 보고서의 과거 산출물 경로는 현재 실행 지침이 아니다.

이 자료는 사용자가 요청한 역사 기록이며, 현재 릴리스의 성능 보증이나
현재 구현의 검증 결과가 아니다. 배포 SDK와 일반 데모의 Canvas 구현은
비교 프로토타입과 별개로 유지한다.
