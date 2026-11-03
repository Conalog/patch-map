# 배경 기하 재사용 후보의 복원 후 GC 진단

2026-11-03. Regression diagnosis. [원 비교](presentation-topology-checkpoint.md)의
기존 Perfetto/GC/heap 기록과 A/B 코드를 재분석했다. 제품 코드 변경, 새 최적화,
실기기 재실행은 없다. 진단 당시 미적용이었으며 이후의 채택은 원 비교 문서에 기록했다.

## 결론

기하 계산이 복원으로 미뤄진 것은 아니다. 줄어든 임시 할당과 추가 보관이 GC 시점과
객체 생존 이력을 바꿨고, 관측된 한 복원에서는 **young GC의 old 영역 승격 뒤
별도의 old GC가 추가 실행됐다.** 앞 단계 GC가 이어진 것과 구분할 수 있다.

단순히 “보관 메모리가 18MiB 늘어서 그만큼 매번 더 청소한다”는 설명도 부정확하다.
유휴 old GC 기준도 직전 수집 후 사용량에 따라 함께 올라간다. 직접 촉발한 변화는
그 기준을 넘긴 복원 중의 old 사용량 증가다. 재사용 배열 자체는 살아 있는 자원이다.

## 코드와 기존 수명 경로

- 후보만 추가한 보관: Float32 좌표 100개 +10,643,200B, Uint16 인덱스 100개
  +7,923,200B, 색상 구간 record 20,000개 +640,000B 및 구간 목록/소유자.
  초기/흐림/복원/반복 후 class heap 기록에서 같은 개수다. 누적 세대 캐시는 아니다.
- 기존은 알파 변경마다 임시 좌표/인덱스/shape/paint를 만들고 버린다. 후보는
  색상 배열과 native Vertices만 다시 만들며 큰 임시 할당을 생략한다.
- `RenderPlan.setPresentation` → `MapBackend.retirement.enqueue` →
  `_SharedGeometry.release` → `StaticGeometry.dispose` 경로는 같다.
  복원에서는 조정 mesh를 해제하고 기본 배경 mesh를 사용한다.
  계산을 대기열에 넣거나 별도 worker로 옮기는 변경은 없다.
- Flutter `Vertices::init`는 native builder에 데이터 복사를 마치고 typed-data 접근을
  해제한다. 후보가 보관한 Dart 배열을 복원 때 엔진이 다시 계산하는 구조도 아니다.

## 실제 트리거: 기존 GC 진단의 첫 흐림→복원

수치는 VM 기록의 kB 단위(1024바이트)다. old 승격량은 young GC 전후 old 사용량의
증가로 관측했다. 개별 객체 타입/할당 지점 추적은 기존 기록에 없다.

| 항목 | A 기존 | B 재사용 |
| --- | ---: | ---: |
| 앞선 흐림 중 young GC 횟수 | 4 | 2 |
| 흐림 완료 후 old GC | 1회 | 1회 |
| 복원 중 young GC에서 old 사용량 증가 | 14KiB | 4,583KiB(약 4.48MiB) |
| 직전 old GC가 설정한 idle 기준 | 115,368KiB | 131,169KiB |
| 복원 후 old 사용량 + external | 114,359KiB | 134,729KiB |
| 기준 대비 | −1,009KiB | +3,560KiB |
| 복원 뒤 새 old marking | 없음 | 1회 |

A/B 모두 앞선 흐림의 old GC는 **복원 시작 약 1.1초 전 이미 종료**했다.
B의 추가 marking은 복원 첫 제출 약 51ms 뒤 시작했고 별도로 완료됐다.
따라서 그 사례는 앞선 수집 작업의 지연 완료가 아니라 추가 수집 한 번이다.

Dart는 살아남은 young 객체를 old로 승격하며 이전 생존률에 따른 조기 승격 정책도
사용한다. 앞선 큰 임시 할당이 사라지면 수집 횟수와 생존 시점도 달라질 수 있다.
관측 기록은 이 세대 이동 차이를 보여준다. 다만 당시 조기 승격 플래그가 켜졌는지,
어떤 객체가 4.48MiB를 구성했는지는 확인할 수 없어 특정 임시 Map 탓으로 단정하지 않는다.

## 왜 51ms 뒤인가

해당 Flutter 소스의 Animator는 추가 프레임이 없으면 51ms 뒤 유휴 알림을 보내고,
RuntimeController는 Dart의 `NotifyIdle`로 전달한다. 애플리케이션에 추가한 타이머가 아니다.
Dart는 마지막 GC 후 old 사용량에 두 페이지를 더한 idle 기준을 검사한다.
이 실행의 기준 여유는 로그에서 1024KiB였다. young GC를 먼저 실행할 수도 있고,
승격 후 old 기준을 넘으면 concurrent marking을 시작할 수 있다.

사용 SDK DEPS가 가리키는 Dart revision `04bcd1036cdc799ac6564988f159ee454d42c822`의
[유휴 GC 판단](https://github.com/dart-lang/sdk/blob/04bcd1036cdc799ac6564988f159ee454d42c822/runtime/vm/heap/heap.cc),
[old 영역 임계값](https://github.com/dart-lang/sdk/blob/04bcd1036cdc799ac6564988f159ee454d42c822/runtime/vm/heap/pages.cc),
[young 승격 정책](https://github.com/dart-lang/sdk/blob/04bcd1036cdc799ac6564988f159ee454d42c822/runtime/vm/heap/scavenger.cc)을 확인했다.
큰 숫자 배열의 모든 요소를 참조 객체처럼 순회한다는 주장은 하지 않는다.

## 원 CPU 비교와 연결되는 근거·한계

기존 5개 실행의 고정 CPU 전체 복원을 다시 시간대로 나눴다. 첫 제출 45ms 이후
DartWorker CPU 실행 시간의 실행별 중앙값은 A 1.82/2.12/2.17ms,
B 98.17/99.72ms였다. 증가 대부분은 첫 제출 뒤 유휴 작업 구간에 있다.
이는 모든 worker 스레드 CPU 합계이며 UI가 100ms 멈췄다는 뜻은 아니다.

GC 전용 진단에서는 후보 복원 3회 중 1회만 추가 old GC가 있었고 나머지에는 없었다.
마지막 복원은 young GC로 old가 662KiB 늘어도 idle 기준 아래라 old GC가 없었다.
즉 **복원 호출 자체가 항상 추가 GC를 요청하는 것이 아니라 이전 할당/수집 이력에
의존한다.** 본 비교와 GC 진단의 준비 이력 차이 때문에 모든 worker 비용을 GC 하나로
100% 귀속하거나 모든 사용 흐름에서 같은 비율로 늘어난다고 말하지 않는다.

화면 지연 감소는 실제다. 동시에 해당 반복 조건의 추가 worker CPU도 실제이며,
“어차피 하던 일을 뒤로 밀었을 뿐”이라며 제외할 수 없다. 고정 CPU 흐림→복원 총합
419.76→433.30ms가 편차 범위라는 기존 판단과, 강조/다른 조건에서의 이득도 유지한다.
새 객체별 allocation trace 없이 세대 이동의 타입별 원인까지 확정하지 않는다.

원자료: `.artifacts/performance/flutter/presentation-topology-gc-diagnosis-20261103/`의
`analyze_existing.py`, `analysis.json`, `identity.json`, 고정 revision `sources/`.
원 실험의 `candidate.patch`, class heap, 5개 Perfetto trace와 `gc-A/gc-B`를 재사용했다.
정책/런타임 변경 없이 진단만 기록했다.
