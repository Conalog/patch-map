# 모바일 전체 보기 모드 전환 — 2026-10-30

진단 완료. **제품 코드 변경 없음.** 직전 [숨은 텍스트 묶음 개선](hidden-presentation-batching-checkpoint.md)
적용 후 현재 확인용 앱에서 막대/숫자 갱신 버튼을 조사했다. 전체 보기 이동과 달리
버튼→최종 갱신 제출에는 약 0.9–1.4초가 필요했다. 아래 고정 주파수의 절대시간이며,
일반 주파수 실사용 지연이나 순수 패키지 갱신 시간으로 해석하면 안 된다.

## 조건과 측정 범위

- 패키지 `12ca0f3c`, 모바일 `a5215060`(런타임 `e27e2ebc`), Flutter 3.47.6 profile AOT.
  사용자에게 제공한 같은 APK를 재빌드 없이 사용했다. 실제 Host/provider/projection과
  패키지를 사용하며 fixture는 10,000개 규칙/비겹침 랜덤, seed 3476, 숫자 0–600과 `W`다.
- SM-S936N / Android 16. CPU 0–5 1.9968GHz, CPU 6–7 1.9584GHz, GPU 443MHz, 60Hz.
  main CPU 6, raster CPU 7, 기타 CPU 0–5. 모든 비교 창의 주파수·코어가 Perfetto에서
  일치했고 trace error/data loss는 0, thermal status도 모두 0이었다.
- 두 배치에서 warmup 1회 + 비교 3회. 규칙 배치 각 조건 CPU/timeline profile 1회는
  별도이며 응답/CPU 비교에서 제외했다. 네트워크는 차단했고 재빌드·동시 테스트는 없었다.
- 버튼과 동일한 command 시작부터 최신 데이터의 앱 `onPublished`까지 측정한다.
  해당 콜백은 패키지 그리기 제출 후다. 랜덤 입력 생성 비용도 별도 기록한다.
- 프레임/CPU 창은 command→제출+250ms로 막대 애니메이션을 포함한다.
  CPU는 모든 스레드 실행 시간의 합이며 사용률 %가 아니다. 제출 전 UI 이벤트 루프에서
  쓰는 긴 동기 비용은 Flutter의 paint/build 프레임 시간만으로는 드러나지 않는다.
- 단계별 함수 표본은 UI isolate의 1ms sampling이다. 표본 비율은 정확한 구간 벽시계
  시간이 아니며, GC/worker/raster 시간과 단순 합산하면 안 된다.

## 서로 다른 숫자 상태

전체 보기에서 숫자는 alpha 0이다. 하지만 준비 이력에 따라 실제 갱신이 다르다.

| 조건 | 사전 상태와 동작 | text show 변화 |
| --- | --- | --- |
| N: 막대→숫자 | 전체 보기 막대에서 숫자 갱신 | false 유지, 새 텍스트 준비는 재확대까지 보류 |
| P: 준비된 숫자→막대 | 확대 숫자 갱신→전체 맞춤 후 막대 갱신 | true → false |
| D: 보류된 숫자→막대 | N 이후 확대하지 않고 바로 막대 갱신 | false 유지 |

각 cycle마다 P의 사전 준비를 다시 설정했다. P/D를 섞지 않았고, 모든 비교에서 카메라,
1만 패널, ready 상태와 기대 모드 유지 및 failure 없음, 프레임 수집 완료를 확인했다.

## 측정 결과

3회 중앙값. 프레임은 실행별 p50의 중앙값, 최대값은 실행별 최대의 중앙값이다.

| 배치·조건 | 갱신 제출 | 입력 생성 제외 | CPU | UI p50 / 최대 | raster p50 / 최대 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 규칙 N | 885ms | 765ms | 1,390ms | 32.3 / 38.5ms | 10.9 / 11.5ms |
| 규칙 P | 1,247ms | 1,115ms | 2,270ms | 34.0 / 51.0ms | 11.1 / 54.4ms |
| 규칙 D | 1,027ms | 911ms | 1,770ms | 33.4 / 47.8ms | 11.0 / 11.2ms |
| 랜덤 N | 992ms | 861ms | 1,460ms | 41.8 / 50.7ms | 11.0 / 11.1ms |
| 랜덤 P | 1,352ms | 1,229ms | 2,320ms | 40.4 / 51.0ms | 11.0 / 40.6ms |
| 랜덤 D | 1,142ms | 1,023ms | 2,010ms | 43.4 / 49.6ms | 11.0 / 11.2ms |

N은 매 실행 3프레임 중 UI 2프레임이 16.67ms를 넘었고 raster 초과는 없었다.
P/D는 6–7프레임 모두 UI 예산을 넘었다. P의 raster는 2–3프레임 초과,
D는 초과가 없었다. 따라서 순간 전환이 매끄럽다고 판정할 결과는 아니다.
랜덤 N 응답 924/1,004/992ms, D CPU 2,110/2,010/1,970ms 등 불리한 표본도 보존했다.

## 확인한 비용

**현재 확인용 버튼은 모드만 바꾸지 않는다.** 새 랜덤 snapshot을 만든 후
`metricsSelectProvider.selectView`로 모드를 바꾸고 registry refresh를 요청한다.
모드 listener의 `reproject`와 새 데이터 load 완료의 `reproject`가 각각 실행된다.
CPU stack에서도 전자는 `DashboardMonitoringCoordinator._runUserChange`, 후자는
`NativeMapProjection._load` 경로로 확인됐다. 실제 서비스의 모드 전환만 수행하는
동작과 이 버튼의 수치를 같다고 볼 수 없다.

규칙 배치 CPU profile을 중복 없이 분류한 표본 비율이다.

| 소유 구간 | N (683개) | P (1,111개) | D (934개) |
| --- | ---: | ---: | ---: |
| 확인용 입력 생성 | 15.2% | 9.3% | 11.0% |
| 모바일 component 구성·깊은 비교 | 24.6% | 15.2% | 17.3% |
| 모바일 차이 추출·제출·완료 상태 처리 | 11.6% | 9.9% | 11.5% |
| 모바일 지표 변환·인덱스 | 8.6% | 3.3% | 5.2% |
| 패키지 동기 접수·검증 | 23.4% | 30.6% | 24.9% |
| 패키지 준비·commit | 5.3% | 12.2% | 6.3% |
| 패키지 그리기·애니메이션 | 7.9% | 16.2% | 20.0% |

나머지는 기타 앱·framework/runtime이다. `NativeProjectionComponents.build`에서
component별 비교와 전체 Map 비교가 모두 보이며 `DeepCollectionEquality.hash`와
Map 해시/조회 비용이 반복된다. 패키지는 `PresentationAdmission.admit`,
`RetainedUpdate.validate`, `PresentationResolver.resolveDelta`에 표본이 집중된다.

P는 text show 변경으로 경계·정적 묶음 증명·공간 인덱스도 갱신한다. P의
`RetainedUpdate.prepare`는 66표본, D는 15표본이었다. 배경 retessellation은 주요
비용으로 나타나지 않았으며 Paragraph를 새로 그리는 비용이 원인인 것도 아니다.
막대 모드는 높이 애니메이션을 수행해 숫자 모드보다 제출 후 프레임도 많다.

별도 profile에서 UI 스레드의 `CollectNewGeneration`은 N 17회/155ms,
P 25회/214ms, D 22회/167ms였다. worker의 Scavenge/ConcurrentMark와 중복 합산하지
않았다. 이는 처리·할당 부담의 증거이며 특정 한 allocation이 전부 원인이라고는
확정하지 않았다. P의 raster 최대 40–54ms는 native 원인을 따로 분해하지 않았다.

## 다음 검토 우선순위와 한계

1. **모드 변경과 데이터 갱신이 연속될 때 중복 표시값 변환·제출을 줄일 수 있는지**
   먼저 검토한다. 버튼을 임의로 단순화해서 제품 성능 개선이라고 주장하면 안 된다.
2. 모바일 component 구성에서 이미 확인한 깊은 Map 비교/해시 비용을 검토한다.
3. 패키지 접수·검증은 실제 비용이지만 계약 제한이나 예외 경로를 바로 추가하지 않는다.

이번에는 가설 최적화나 계약 변경을 적용하지 않았다. 입력 생성 제외 시간도 모바일의
변환·상태 처리·패키지를 포함하므로 순수 renderer 수치가 아니다. 메모리·iOS·실제 API·
동시 드래그/핀치까지 범위를 넓히지 않았다.

로컬 raw는 `.artifacts/performance/flutter/mobile-overview-mode-switch-20261030/`의
계획·identity·runner·samples·CPU/timeline·Perfetto·summary다. 원시 `barSubmissions`는
publication마다 초기화되는 카운터이므로 전환 전후 차이를 제출 횟수로 해석하지 않았다.
고정 성능 모드·화면 설정·forward·trace를 정리하고 앱을 정상 설정으로 재실행했다.
사용자 확인용 앱은 유지했으며 모바일 worktree와 원본 main은 수정하지 않았다.
