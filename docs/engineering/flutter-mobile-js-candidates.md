# Android and iOS JavaScript runtime candidates

- Status: proposed; 2026-09-14 패키지 문서·배포 소스 조사
- Requirement: Android와 iOS 모두 필수이며 WebView 화면 없이 Flutter에서 직접 렌더링한다.
- Scope: [JS runtime 설계](flutter-js-runtime-review.md)의 구체 후보 선정. 지원 표는 PatchMap 실기기 qualification 완료를 의미하지 않는다.

## 후보와 우선순위

| 후보 | Android / iOS | 확인한 특성 | PatchMap 판단 |
| --- | --- | --- | --- |
| [jsf 1.1.0](https://pub.dev/packages/jsf) | QuickJS / QuickJS | 동기 eval/call, JS 함수 handle, Dart callback, TypedArray/ArrayBuffer 변환, module loading | 우선 PoC 후보. 정확한 함수·buffer 경로와 재진입·해제를 검증한다. |
| [flutter_js 0.8.7](https://pub.dev/packages/flutter_js) | 기본 QuickJS / JavaScriptCore | 동기 FFI, 두 플랫폼 지원 | 비교 기준 후보. [확인한 binding 제약](flutter-js-runtime-review.md)을 보완해야 한다. |
| [quickjs_engine 0.1.5](https://pub.dev/packages/quickjs_engine) | QuickJS-NG / QuickJS-NG | 같은 엔진을 동봉하는 flutter_js fork | 엔진 통일 대안. 상속한 binding 문제가 남아 있어 교체만으로 해결되지 않는다. |
| [fjs 3.3.0](https://pub.dev/packages/fjs) | QuickJS / QuickJS | Rust와 flutter_rust_bridge 사용; 공개 eval/call은 Future | 비동기 작업 후보. 현재 동기 mutation·callback 순서 보존에는 별도 설계가 필요하다. |
| [javascript_flutter](https://pub.dev/packages/javascript_flutter) | Jetpack JavaScriptEngine / JavaScriptCore | 시스템 엔진 사용, Android method channel, 비동기 평가 | Android 가용성·프로세스 경계·결과 전달 때문에 지속적 frame 경로에서는 후순위다. |
| 직접 native FFI binding | QuickJS 계열 양쪽 또는 Android QuickJS/iOS JSC | 필요한 batch/buffer/job/lifetime 경로를 직접 제어 | 기존 wrapper가 요구를 못 맞출 때 선택한다. 엔진 업데이트·native 빌드·ABI 유지보수 비용을 수용해야 한다. |

jsf·quickjs_engine·fjs는 pub.dev의 해당 버전 archive에서 선언과 주요 구현을 확인했다. 문서의 “high performance” 표현은 측정 증거로 사용하지 않았다. flutter_qjs·flujs 등의 추가 후보도 있으나 플랫폼 지원 여부만으로 위 후보보다 우선할 이유는 아직 확인하지 못했다.

## 확인한 구현 세부사항

jsf 1.1.0의 `Runtime.eval/call`은 동기이며 native 구현은 FFI 경로다. 패키지에는 Android NDK/CMake와 iOS CocoaPods 설정이 있다. 해당 설정은 Android minSdk 21, iOS 12.0을 선언하지만, 실제 PatchMap의 최소 OS는 선택한 Flutter SDK·앱·다른 의존성까지 고려해 확정한다. 패키지 선언만으로 그 OS 조합이 검증됐다고 주장하지 않는다.

[jsf의 handle 규칙](https://pub.dev/packages/jsf)은 소유한 handle의 dispose, callback에서 빌린 handle의 유효 범위, 생성 isolate에서의 runtime 사용을 명시한다. `eval()`의 자동 변환은 객체를 Dart 값으로 변환하므로 identity 유지나 zero-copy를 보장하지 않는다. hot path는 함수 handle과 명시적인 batch/buffer 경로를 사용해 복사량·호출 횟수를 측정한다.

quickjs_engine 0.1.5의 배포 archive를 확인했으며 `QuickJsRuntime2.callFunction`의 UnimplementedError와 `convertValue<T>`의 `true as T`가 남아 있다. 새로운 QuickJS-NG를 동봉한다는 사실과 Dart binding 완성도는 별개다. 다른 호출 경로로 보완할 수 있으므로 방식 자체의 불가 판정은 아니다.

fjs 3.3.0의 배포된 `JsEngine.eval/call`은 Future를 반환한다. 이것이 자동으로 느리다는 의미는 아니다. 다만 동기 update 결과와 그 안에서 발생하는 listener 재진입을 기존 계약대로 제공하려면 공개 facade·호출 순서 설계가 필요하다. `flutter_rust_bridge`를 쓴다고 PatchMap 코어를 Rust로 재작성해야 하는 것은 아니다.

[Android 공식 문서](https://developer.android.com/develop/ui/views/layout/webapps/jsengine)에 따르면 Jetpack JavaScriptEngine은 WebView 인스턴스 없이 별도 프로세스에서 JS를 평가한다. Android API 26 이상이면서 시스템 WebView 구현이 이를 지원해야 하며 `isSupported()` 검사가 필요하다. 따라서 화면을 WebView로 그리는 방식은 아니지만, 시스템 WebView 구현에도 의존하지 않으려면 해당 경로를 선택하지 않는다. 공식 문서도 non-interactive evaluation 용도를 설명한다.

## 공통 engine을 쓰는 이점과 한계

Android/iOS에 같은 QuickJS 버전을 동봉하면 언어 기능·engine 버전 차이의 검증 변수를 줄일 수 있다. 그러나 ABI·스레드·메모리·폰트·GPU는 여전히 다르며 동일성을 자동 보장하지 않는다. QuickJS/JSC를 나누는 방식도 동일 conformance를 통과하면 허용한다. 둘 중 어느 쪽이 빠른지는 실측 전 미정이다.

두 engine 전략 모두 Flutter용 JS 번들과 native renderer를 npm 실행 경로에서 분리할 수 있다. “양쪽 모바일을 지원하려면 npm도 변경해야 한다”거나 “iOS라서 JS 실행이 불가능하다”는 전제는 두지 않는다.

## 권장 실험 순서

1. 작은 runtime port 뒤에 명령 실행·callback·job 처리·변경분 전달·dispose를 둔다. 소비자 API에 특정 JS wrapper의 handle이나 타입을 노출하지 않는다.
2. jsf의 동기·함수 handle 경로로 실제 TS 코어 slice를 실행한다. flutter_js를 비교 후보로 두고 필요한 경우 다른 binding을 평가한다. 초기부터 여러 runtime을 제품에 전부 동봉하지 않는다.
3. Android와 iOS에서 각각 release build, cold start, 대량 load/update, callback 재진입, typed-buffer 전달, Promise/타이머 취소, 반복 dispose를 검사한다. simulator/desktop만으로 양쪽 지원 완료를 선언하지 않는다.
4. 같은 Flame/Canvas renderer로 frame/input latency·raster·memory·idle 비용을 비교한다. 같은 [conformance](flutter-conformance-design.md)와 [materiality 기준](verification.md)을 적용한다.
5. JS 후보가 전체 기능·성능·수명을 통과하면 채택할 수 있다. wrapper 보완이나 bridge 비용이 큰 경우 독립 Dart 구현과 비교해 선택한다.

Android/iOS 지원 가능성은 확인했다. PatchMap에 사용할 최종 패키지와 성능 우위는 아직 확정하지 않았으며, 이번 조사에서 native 앱을 빌드하거나 실기기 테스트하지 않았다.
