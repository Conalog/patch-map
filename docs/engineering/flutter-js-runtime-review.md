# Embedded JavaScript runtime review

- Status: review complete; JS runtime 미채택; 2026-09-14 정적 조사와 [bar slice 시뮬레이터 실측](flutter-mobile-benchmark.md), 실기기 성능은 미측정
- Context: [Flutter package design](flutter-package-design.md)의 독립 Dart 구현과 임베디드 JS 대안 비교
- Conclusion: Android/iOS에서 JS 실행은 가능하지만 최종안은 독립 Dart + 직접 Canvas다. 대량 bar 실측과 Dart 내부의 직접 데이터 경로를 근거로 선정했다. 상세 결정은 [architecture decision](flutter-package-design.md)이 소유한다.
- Android/iOS 필수 지원 후보는 [Mobile JS candidates](flutter-mobile-js-candidates.md)에서 비교한다.

## 실제 가능한 구성

[flutter_js](https://pub.dev/packages/flutter_js)는 조회 기준 0.8.7이며 Dart FFI로 JS를 동기 실행한다. 기본 Android/Windows/Linux는 QuickJS, iOS/macOS는 JavaScriptCore다. Promise와 Dart HTTP 기반 fetch 지원도 제공한다. “WebView가 필요하다”, “모든 호출이 비동기다”라는 이유로 배제하면 잘못이다.

```text
현재 TS 동작 소스
   |                          |
기존 npm build          Flutter용 headless JS bundle
   |                          |
브라우저 JS + Pixi       flutter_js (QuickJS/JSC)
                              |
                     명령/결과 + dirty projection bridge
                              |
                      Dart Canvas renderer
```

JS는 scene·history·선택·편집·publication의 유일한 권위이고, Dart는 파생 rendering cache와 입력·asset·surface 실행을 소유한다. npm은 기존 배포물을 사용하며 Flutter 패키지에는 빌드된 JS를 동봉한다. 앱 소비자에게 npm 설치나 원격 script 다운로드를 요구하지 않는다. 두 곳에 package를 배포할 수 있고 WebView도 없다.

다만 JS 엔진은 브라우저가 아니다. 현재 `src/index.ts`의 Pixi mount, HTMLElement·canvas·ResizeObserver 기반 수명/캡처를 통째로 실행하면 Flutter Canvas가 생기지 않는다. DOM/Pixi를 제외한 별도 entry와 host adapter가 필요하다. Pixi canvas/WebGL 전체를 흉내 내는 bridge는 Flutter 직접 렌더러보다 훨씬 큰 작업이므로 채택하지 않는다.

## 이 저장소에서 재사용할 수 있는 것

| 영역 | JS 재사용 가능성과 추가 작업 |
| --- | --- |
| `src/semantic/`, `src/geometry/`, `src/history/` | TS를 JS로 빌드해 알고리즘 재사용 가능성이 높다. 텍스트 segmentation은 이미 host ICU 없이 결정적이다. 런타임 API 사용과 bundle import는 검사해야 한다. |
| `src/core/`, `src/engine/` | 동기 commit·재진입·history 규칙 재사용 가치가 크다. 일부 DOM lifecycle/capture/timer 의존은 분리해야 한다. |
| `src/rendering-port/`, `src/core/contracts.ts` | projection·dirty range·frame 계약이 출발점이다. in-process 메서드 호출을 그대로 원격 객체처럼 연결하지 않고 bounded batch bridge로 설계한다. |
| `src/assets/`, `src/rendering/` | 정책과 결과 의미는 유지한다. Pixi texture·browser font·readback은 Dart adapter가 구현한다. |

코어 공유가 가능해도 native text/image/input/capture 동일성은 자동 해결되지 않는다. 반대로 이 재사용으로 복잡한 TS 규칙을 Dart로 다시 작성할 필요를 줄일 수 있으므로 실제 비용을 비교해야 한다.

## flutter_js 0.8.7에서 확인한 제약

공식 [버전 API](https://pub.dev/packages/flutter_js/versions)와 pub.dev 배포 archive의 소스를 확인했다. 아래는 특정 패키지·버전의 사실이며 모든 JS engine의 한계가 아니다.

| 확인 사실 | PatchMap 영향·대응 |
| --- | --- |
| [QuickJsRuntime2.callFunction](https://pub.dev/documentation/flutter_js/0.8.7/quickjs_quickjs_runtime2/QuickJsRuntime2/callFunction.html)은 UnimplementedError를 던진다. | 공통 API만으로 양 플랫폼 callback을 연결할 수 있다고 가정하지 않는다. rawResult/JSInvokable 등 다른 경로가 있어 JS 함수 호출 전체가 불가능한 것은 아니다. |
| [convertValue](https://pub.dev/documentation/flutter_js/0.8.7/quickjs_quickjs_runtime2/QuickJsRuntime2/convertValue.html)는 입력 변환 대신 `true as T`를 반환한다. | 결과·typed buffer bridge를 명시적으로 구현하고 QuickJS/JSC 모두 검사해야 한다. |
| [기본 message bridge](https://pub.dev/documentation/flutter_js/0.8.7/quickjs_quickjs_runtime2/QuickJsRuntime2/initChannelFunctions.html)는 JSON 문자열을 decode한다. | 명령 단위에는 가능하나 매 entity·매 frame 전량 전송에는 부적합할 위험이 있다. binary/typed-buffer의 복사·소유권을 실측한다. zero-copy를 가정하지 않는다. |
| [Promise helper 소스](https://github.com/abner/flutter_js/blob/master/lib/extensions/handle_promises.dart)의 해당 배포 구현은 20ms 간격 pending-job 처리를 사용한다. | 모든 동기 JS 호출의 지연이 20ms라는 뜻이 아니다. helper를 frame path에 사용하지 않고 host event/frame에 job pump를 연결할 수 있는지 검증한다. |
| [timer shim](https://github.com/abner/flutter_js/blob/master/lib/javascript_runtime.dart)의 해당 배포 구현은 setTimeout handle을 반환하지 않으며 lib에 clearTimeout 구현이 없다. | `src/scheduler/frame-driver.ts`와 `src/engine/pointer-interaction-coordinator.ts`의 취소 의미가 그대로 충족되지 않는다. 취소·destroy를 소유하는 host timer/frame port가 필요하다. |

상위 Github 링크는 이동할 수 있다. 위 판단은 0.8.7 archive 기준이며 채택 시 exact version과 archive digest를 고정하고 재검증한다. 보완 가능한 문제이며 패키지를 고칠지 다른 binding을 쓸지에 따라 유지보수 비용이 달라진다.

[flutter_qjs](https://pub.dev/documentation/flutter_qjs/latest/)는 동기 evaluate, Uint8List/ArrayBuffer 및 함수 변환, isolate 실행을 문서화한다. [최신 배포](https://pub.dev/packages/flutter_qjs/versions)는 조회 기준 4년 전이므로 현대 SDK와 native target qualification이 필요하다. 이 역시 고속 전송이 원천 불가능하지 않음을 보여주며, 특정 wrapper 문제를 방식 전체의 불가 판정으로 확대하지 않는다.

## 독립 Dart 선택의 근거와 비용

| 관점 | 독립 Dart | JS 코어 + native renderer |
| --- | --- | --- |
| 기존 동작 재사용 | 알고리즘 포팅과 SSOT drift 관리 필요 | 복잡한 parsing·history·editor 수정 재사용에 유리 |
| 프레임 경로 | Dart state에서 renderer로 직접 접근 | JS 계산 + bridge + Dart projection + raster 비용을 함께 고려 |
| cold load | Dart parsing/layout 구현 필요 | 기존 코어 재사용 이점; JS 초기화·bundle 실행 비용 추가 |
| 메모리 | Dart state/cache와 Flutter GPU 자원 | JS heap·Dart projection cache·native handles 수명 추가 |
| 최적화 | 자료구조·scheduler를 Flutter에 맞게 변경하기 쉽다 | batch·delta·native cache로 비용을 낮출 여지가 있다 |
| 유지보수 | 두 동작 구현을 관리 | 한 동작 구현과 두 host/renderer 및 bridge/runtime binding을 관리 |
| npm 영향 | 기존 구현 유지 가능 | 별도 entry/build이면 기존 npm 경로 유지 가능; 공통 소스 수정 시 회귀 검증 |

독립안의 이유는 모든 JS 구성이 느리다고 입증됐기 때문이 아니다. 이 라이브러리는 대량 갱신·hit test·회전/애니메이션·text/image publication이 자주 실행되고 이미 native renderer를 새로 만들어야 하므로, 경계를 오가는 비용과 binding 수명을 줄이는 데 가치가 있다고 판단한 것이다. 반면 TS 코어의 복잡도와 장기 수정 비용이 크면 JS 재사용 이득이 더 클 수 있다. [선정한 실측](flutter-mobile-benchmark.md)은 대량 bar geometry에서 Dart에 유리했지만, 축 정렬 특화 구현과 기존 범용 JS 함수의 비교다. 전체 기능의 성능과 총 작업량은 미확정이다.

JS 방식도 npm과 실행 의존성을 격리할 수 있다. 따라서 “npm 성능에 영향을 준다”는 이유로 JS 방식을 배제하지 않는다. 공통 소스 분리가 기존 hot path를 바꾸는 경우만 npm baseline/candidate로 검증한다.

## 비교 완료와 최종 판정

flutter_js·quickjs_engine·jsf의 JSON 및 buffer 경로를 같은 Canvas renderer와 비교했다. [실험 문서](flutter-mobile-benchmark.md)가 측정 범위·통합 수정·환경·판정을 소유한다. 대량 전체 갱신에서는 독립 Dart가 paired frame 기준으로 우세했고, flutter_js buffer의 작은 갱신은 중립이었다. 전체 요구를 고려해 독립 Dart 하나를 권장한다.

JS 의미 처리와 Dart geometry만 결합하면 전달량을 줄일 수 있다. 이 구성의 성능은 측정하지 않았으므로 실측으로 탈락시켰다고 주장하지 않는다. 다만 최종안에는 포함하지 않는다. 실행 시 공유를 위해 상태·호출·수명 경계를 추가하는 대신, Dart 안에서 처리하고 공통 명세와 전체 conformance로 기능을 일치시킨다.

이 문서의 JS 구성과 보완 항목은 미채택 대안의 분석이다. 추가 후보 선정을 완료 조건으로 두지 않는다. 전체 기능·실기기 성능·pub.dev 배포 검증은 선정된 Dart 구현의 출시 조건이다.
