# 10,000개 서비스 패널 텍스트·아이콘 갱신 최적화

2026-09-16. **최종 성능 목표 판정: FAIL. 갱신 지연은 개선됐지만 프리즈 해소·60fps를 달성한 것은 아니다.**
Android 에뮬레이터에서 동작 계약을 유지한 최적화 후보 여섯 가지를 검증했다.
실기기와 iOS 성능은 이 결과로 판정하지 않는다.

## 결과

동일 환경의 두 번 실행을 합친 40개 측정의 p95(ms)다. warmup은 제외한다.

| 지표 | 기존 text | 개선 text | 기존 icon | 개선 icon |
| --- | ---: | ---: | ---: | ---: |
| 동기 commit | 281.9 | 152.3 | 655.3 | 64.4 |
| 자산 준비(누적) | 296.3 | 167.6 | 1,381.6 | 90.6 |
| publication | 395.2 | 291.1 | 1,659.0 | 246.7 |
| frame build | 72.5 | 85.3 | 252.3 | 35.0 |
| frame raster | 174.3 | 180.8 | 1,580.3 | 166.5 |

- 텍스트 publication p95는 **104.0ms(26.3%) 감소**, 아이콘은 **1,412.2ms(85.1%) 감소**했다.
- 텍스트 commit은 약 130ms, 아이콘 commit은 약 591ms 줄었다. 여전히 텍스트의
  동기 호출은 100ms를 넘으므로 입력이 끊기는 느낌이 남을 수 있다.
- 텍스트 build p95는 **72.5→85.3ms 악화**, raster는 **174.3→180.8ms 악화**했다.
  두 번째 반복만 보면 build가 71.0→95.6ms, 약 35% 늘었다. 총 갱신 지연의 개선과
  프레임 성능의 비회귀를 혼동하지 않는다. `no-regression PASS`로 판정하지 않는다.
- 아이콘은 CPU 처리, raster와 RSS 모두 크게 개선됐다. 다만 개선 후에도 build 약35ms,
  raster 약166ms이므로 60Hz 프레임 예산에는 미달한다.
- publication은 자산 준비 뒤 새 interaction revision을 수락한 프레임의 post-frame
  관측이다. **GPU 완료 시각이 아니다.** raster는 별도 엔진 지표이며 각각의 p95를
  합산해서 총 지연으로 해석하면 안 된다.

## 조건과 식별

- mode: `optimization`. authority: `AGENTS.md`,
  [검증 정책](../../../docs/engineering/verification.md),
  [프로젝트 벤치마크](../benchmark.md).
- baseline: `a981a782c81420775124a04e4b9b8a02a7eabeee`의 생산 코드.
  candidate: 이 보고서와 함께 커밋되는 변경. 생산 코드·fixture·lockfile·동일 측정
  harness의 SHA256, 네 APK SHA256, 도구 버전과 raw 해시는
  [구조화 결과](panel-10000-optimization.json)에 기록한다.
- Flutter 3.41.4 / Dart 3.11.1, Android API34 ARM64, profile/AOT APK.
  baseline/final 모두 동일한 `--target-platform=android-arm64` 빌드 옵션이다.
- 전용 AVD `PatchMap_10k_Perf_API34`, RAM4GB, 4core, 1080×2400,
  DPR2.625, 60Hz, Apple M2 host GPU, `-no-window -gpu host`.
  기존 설치 이미지 사용; 전용 AVD에서 Play Store 비활성화, Wi-Fi/data off.
  사용자 AVD 설정은 변경하지 않았다. APK는 모두 미리 빌드했고 측정 중 빌드·테스트를
  겹치지 않았다. 각 실행 전후 guest 메모리·swap·process load를 보존했다.
- 실제 `conformance/scenes/panel-groups.json` 템플릿: 100그룹 × 5행 × 20열.
  배경·border·padding·가득 찬 bar를 유지하며 선택한 text/icon만 표시한다.
  `PatchMap.create`와 `PatchMapView`, 논리 Canvas360×640, 전체 fit,
  scale0.06375838926174497. viewport와 workload는 모든 비교에서 동일하다.
- text: seed0x5eed, 1…9999 문자열을 매번 10,000개 갱신. icon: 모든 인스턴스를
  내장 `loading`/`object` SVG alias로 번갈아 변경. 한 번의 `updateBatch`, history off,
  입력 생성은 측정 밖. remote/network/처음 다운로드의 성능 결과는 아니다.
- 각 프로세스에서 5회 warmup+20회 측정, 간격100ms. 새 앱 lifecycle에서
  baseline text→final text→baseline icon→final icon, 이어서 각 케이스의 역순 반복.
  p95는 nearest rank. 총 160개 측정과 40개 warmup 모두 보존했다.
- frame ID로 publication과 엔진 timing을 연결했다. text와 final icon은 각각40개,
  baseline icon은37개 timing이 대응한다. 미대응3개는 누락 사실을 보존하며
  GPU 지표의 표본 한계다. publication/commit 행은 빠짐없이40개다.

## 반복과 메모리

각 실행 p95(ms), RSS는 MiB. 샘플 종료 RSS와 프로세스 peak RSS는 서로 다른 지표다.

| 실행 | commit | publication | build | raster | 종료 RSS | peak RSS |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| baseline-text-1 | 281.9 | 395.2 | 76.7 | 171.8 | 855.2 | 901.8 |
| baseline-text-2 | 271.5 | 382.9 | 71.0 | 174.3 | 833.8 | 898.5 |
| baseline-icon-1 | 663.8 | 1,659.0 | 254.7 | 1,585.1 | 956.9 | 1,111.6 |
| baseline-icon-2 | 645.7 | 1,647.8 | 252.3 | 1,565.4 | 996.9 | 1,117.4 |
| final-text-1 | 152.3 | 283.0 | 84.0 | 180.4 | 875.6 | 907.4 |
| final-text-2 | 150.5 | 292.5 | 95.6 | 184.5 | 875.9 | 908.0 |
| final-icon-1 | 64.9 | 246.7 | 35.7 | 168.6 | 684.6 | 720.3 |
| final-icon-2 | 64.1 | 246.6 | 34.2 | 164.0 | 689.8 | 719.1 |

텍스트 종료 RSS는 약20–42MiB 증가했고 peak RSS 증가는 약6–10MiB다.
아이콘 종료 RSS는 약272–307MiB 감소했다. 전체 프로세스 관측이므로 이 차이를
캐시 자체의 할당량으로 단정하지 않는다. 숫자 문자열의 반복 작업집합에 대한
결과이며 매번 완전히 새로운 자유 텍스트에서도 같은 이득을 보장하지 않는다.

## 첫 번째 변경의 지연

위 p95는 warmup 이후 반복 갱신이다. 별도로 남긴 각 새 프로세스의 첫 변경(sample0)은
다음과 같다. 케이스당 두 관측뿐이므로 cold p95로 부르지 않는다.

| 첫 publication | 기존 두 관측(ms) | 개선 두 관측(ms) |
| --- | --- | --- |
| text | 510.2 / 476.9 | 452.7 / 487.5 |
| icon | 3,156.2 / 3,098.6 | 382.4 / 339.3 |

**첫 텍스트 변경에서는 일관된 개선이 확인되지 않았다.** 개선 후에도 약453–488ms,
동기 commit 약347–372ms다. 반복 작업집합 캐시의 이득을 첫 클릭의 프리즈 해소로
표현하면 안 된다. 첫 아이콘 변경도 반복 상태보다 느리다. 자산은 내장 파일이며
네트워크 cold load의 관측은 아니다.

## 검증한 가설과 유지한 구현

1. **네이티브 문단 재생성**: 활성 문단은 유지하고 비활성 paragraph 여유를
   1,024→8,192로 확대했다. 단독 text publication p95 약31ms 감소.
   추가 메모리 비용과 최종 text 프레임 악화를 위 표에 함께 남긴다.
2. **의미상 같은 텍스트 레이아웃 반복**: controller-local LRU8,192개로
   완전한 layout input을 키로 재사용. 64자를 넘는 문자열은 우회한다.
   단독 text publication p95 약67ms 감소. Unicode/RTL/줄바꿈·style·frame을 보존한다.
3. **자산 준비 전에 중복 무효화**: `_prepareBindings` 시작 시 불필요한 전체
   invalidate를 제거했다. 신규 자산 완료·명시적 재등록은 기존 승인 경로로 통지한다.
   단독 icon publication p95 약263ms 감소.
4. **icon source 변경 시 전체 projection**: 검증한 instance alias-only batch는
   변경 primitive/paint slot만 교체한다. bounds/hit/order/다른 component는 유지한다.
   지원하지 않는 모양·구조 변경·진행 중 변형/애니메이션은 일반 경로로 돌아간다.
   단독 projection 후보는 icon commit p95 약787→180ms로 감소했다.
5. **리소스 갱신 때 mesh 전체 재생성**: intrinsic image 크기가 같으면 geometry를
   유지하고 이미지·native paragraph만 새로 준비한다. 정규화 descriptor key는
   immutable registration 객체에 대한 weak cache로 재사용한다. 오래된 snapshot을
   이어서 보관하지 않는다. 4+5 조합의 commit 중앙값은 약77ms였다.
6. **같은 SVG를 10,000번 vector/saveLayer로 그리기**: 실제 화면 배율에 맞는
   이미지로 재사용한다. 아이콘만 적용하며 32변종, 4,194,304pixels, 한 축2,048px
   상한을 둔다. 초과/생성 실패는 vector path. 4+5+6 조합에서 icon publication p95는
   약299ms, raster 중앙값은 약176ms였다. zoom/DPR·자산 교체·dispose 시 정리한다.

1–3은 개별로, 4→4+5→4+5+6은 병목을 따라 누적 실험했다.
서로 다른 경계의 모든 수학적 조합을 돌리지는 않았다. 최종1–6 조합을 동일한
통제 환경의 baseline과 새 lifecycle로 두 번 검증했다. prototype/backend/Flame을
추가하지 않았고 npm 생산 코드는 변경하지 않았다.

## 불리한 실행과 환경 영향

아래는 초기 진단과 통제 전의 실행이다. **최종 개선율 계산에 섞지 않는다.**
각 raw 파일과 해시는 구조화 결과에 남겼다.

| 진단 파일 | commit p95(ms) | publication p95(ms) |
| --- | ---: | ---: |
| baseline-text | 341.7 | 467.4 |
| baseline-icon | 787.1 | 2,008.5 |
| cache-text | 307.7 | 436.2 |
| assets-icon | 734.0 | 1,745.6 |
| layout-text | 243.9 | 400.7 |
| projection-icon | 179.6 | 1,615.4 |
| retained-icon | 90.7 | 1,420.8 |
| raster-icon | 79.8 | 299.0 |
| final-text-1 | 1,915.8 | 2,900.6 |
| control-text | 3,189.0 | 4,333.3 |
| cold4g-baseline-text-1 | 331.0 | 735.4 |
| cold4g-final-text-1 | 206.4 | 731.0 |
| cold4g-baseline-icon-1 | 690.5 | 3,593.0 |
| host4g-baseline-text-1 | 2,943.7 | 3,901.8 |
| host4g-final-text-1 | 1,893.3 | 3,425.7 |

초기2GB AVD의 장시간 반복 설치 후 final 조합이 느려졌고, 같은 환경에서 HEAD를
복원한 control도 느려졌다. guest swap 약570MB와 시스템/Play Store 경합이 있었다.
이것만으로 캐시의 영향이 없었다고 단정하지 않았다. 4GB 재시작에서도
headless auto GPU는 SwiftShader를 선택했고, 일반 AVD의 host GPU 실행에는
다시 background 작업이 섞였다. 따라서 전용 AVD+명시적 host GPU+offline 상태를
고정한 마지막8개 실행만 최종 비교에 사용했다. 통제 환경에도 비활성 guest page의
swap은 존재하며 swap이0이었다고 주장하지 않는다.

## 정확성·수명 검증

- 변경 경계의 Flutter 테스트67개 통과: alias/null 복원·거절 시 원자성·잘못된
  column의 부분 반영 방지·snapshot 보존·bounds·asset binding/lease 해제.
- semantic layout 재사용은 숫자·한글·emoji·RTL·줄바꿈, style/overflow/frame 변화와
  LRU eviction/clear를 검증했다.
- 비대칭 SVG의 tint·alpha·회전 결과를 vector reference와 비교했다. 미세한 경계
  샘플링 차이만 허용한다. zoom bucket 경계와 oversized vector fallback→축소 복귀,
  resource refresh/dispose, 늦게 등록한 font의 재승인을 검증했다.
- Dart lib/test 및 변경 integration target 정적 분석 통과.
- 별도 읽기 전용 리뷰에서 추가 schema/ownership/lifecycle blocker 없음.
  리뷰 지적의 late registration 재승인과 zoom fallback 복구를 반영했다.
- 공유 public conformance 10개 fixture·177개 명령의 npm/Dart 관측이 일치했다.
  실제 배포 allowlist로 만든 Dart 패키지68개 파일의 설치·분석·공개 asset decode와
  lifecycle 검증도 통과했다. 이 검증을 위해 빠져 있던 Node 의존성은 기존 lockfile과
  로컬 npm cache로 복원했다. 의존성 버전이나 lockfile은 변경하지 않았다.

## 남은 문제와 제안

동일 기능·동기 atomic API를 유지한 범위에서 측정으로 확인한 후보를 반영했다.
모든 가능한 엔진 최적화를 소진했다고 주장하지 않는다. 현재 잔여 비용은 텍스트
layout/paint 준비와 전체보기에서 수만 개 primitive를 그리는 작업이다.

**권장 제품 방향은 전체보기에서 집계·상태색을 보여주고 확대하면 상세를 표시하는 것이다.**
이번 fit에서 text 최대14는 화면상 약0.89 logical pixel, icon20은 약1.28 pixel이다.
이 크기에서 10,000개의 개별 숫자/아이콘은 읽을 수 없는데 렌더 비용은 계속 든다.
다음은 이번 변경에 몰래 적용하지 않은 선택 사항이다.

1. **확대 단계별 표시(LOD)**: 전체보기는 패널 상태색·그룹 집계만, 충분히 확대하면
   text/icon 표시. 선택·검색·원본 데이터는 전체를 유지한다. 상세 표시 문턱은 실제
   화면으로 결정하고, 도입할 때 npm/Dart의 공통 계약과 옵션으로 정의한다.
2. **서비스 갱신 병합**: 같은 객체의 밀린 값은 최신 값으로 합치고 실제 바뀐 대상만
   batch로 전달한다. 중간 데이터의 표시 생략이 허용되는 서비스에 한정한다.
   모든 값이 바뀌는 이번 worst case에는 diff 자체의 이득이 없다.
3. **그룹 상세 진입**: 100그룹 개요에서 그룹을 선택해 상세를 보는 흐름으로
   화면상 상세 정보량을 제한한다. 화면 밖 정보의 갱신/조회 정합성은 유지해야 한다.

후속 엔진 후보로 일반 text/image atlas+drawAtlas, occlusion-aware batching 등이 있다.
다만 문단 shaping·stroke·RTL·반사/회전·paint order를 보존하는 별도 설계와 측정이
필요하다. viewport culling만으로는 **이번 모든 객체가 보이는 fit**의 병목이 사라지지
않는다. isolate/시간분할로 현재 동기 atomic API를 조용히 비동기로 바꾸는 방식도
계약을 위반하므로 적용하지 않았다. 위 제품 선택과 별도로 검토할 수 있다.

## 보존과 정리

원시 JSON·로그·APK는 무시된 `.artifacts/performance/panel-10k/`에 보존한다.
이 문서와 구조화 통계/identity는 역사 기록이며 릴리스 성능 보증이 아니다.
현재 생산 소스가 측정 당시 manifest의 소스 해시와 일치함을 독립 리뷰에서 확인했고,
측정 APK 해시는 별도로 기록했다.
전용 에뮬레이터는 측정 후 종료·삭제했으며 설정과 로그는 보존했다.
기존 사용자 AVD 설정은 변경하지 않았다.
실기기/iOS와 전체 기능·성능 matrix는 이번 Android simulator 요청 범위에서 실행하지 않았다.
