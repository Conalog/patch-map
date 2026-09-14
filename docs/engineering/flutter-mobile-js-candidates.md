# Android and iOS JavaScript runtime candidates

- Status: comparison complete; 세 측정 후보 모두 최종안에서 미채택; 2026-09-14 문서·배포 소스 조사와 bar slice 시뮬레이터 측정 완료
- Requirement: Android와 iOS 모두 필수이며 WebView 화면 없이 Flutter에서 직접 렌더링한다.
- Scope: [JS runtime 설계](flutter-js-runtime-review.md)의 구체 후보 선정. 지원 표는 PatchMap 실기기 qualification 완료를 의미하지 않는다.

## 조사한 대안과 판정

| 후보 | Android / iOS | 확인한 특성 | PatchMap 판단 |
| --- | --- | --- | --- |
| [jsf 1.1.0](https://pub.dev/packages/jsf) | QuickJS / QuickJS | 동기 eval/call, JS 함수 handle, Dart callback, TypedArray/ArrayBuffer 변환, module loading | 측정 완료·미채택. 대량 갱신은 Dart보다 느렸다. |
| [flutter_js 0.8.7](https://pub.dev/packages/flutter_js) | 기본 QuickJS / JavaScriptCore | 동기 FFI, 두 플랫폼 지원 | 측정 JS 중 대량 갱신 준비 시간이 가장 짧았으나 Dart보다 느려 미채택. |
| [quickjs_engine 0.1.5](https://pub.dev/packages/quickjs_engine) | QuickJS-NG / QuickJS-NG | 같은 엔진을 동봉하는 flutter_js fork | 측정 완료·미채택. iOS 통합을 보완했으나 Dart보다 느렸다. |
| [fjs 3.3.0](https://pub.dev/packages/fjs) | QuickJS / QuickJS | Rust와 flutter_rust_bridge 사용; 공개 eval/call은 Future | 미채택·미측정. 현재 동기 mutation·callback 순서 보존에는 별도 설계가 필요하다. |
| [javascript_flutter](https://pub.dev/packages/javascript_flutter) | Jetpack JavaScriptEngine / JavaScriptCore | 시스템 엔진 사용, Android method channel, 비동기 평가 | 미채택·미측정. Android 가용성·프로세스 경계·결과 전달 제약이 있다. |
| 직접 native FFI binding | QuickJS 계열 양쪽 또는 Android QuickJS/iOS JSC | 필요한 batch/buffer/job/lifetime 경로를 직접 제어 | 미채택·미측정. 엔진 업데이트·native 빌드·ABI 유지보수 비용이 추가된다. |

jsf·quickjs_engine·fjs는 pub.dev의 해당 버전 archive에서 선언과 주요 구현을 확인했다. 문서의 “high performance” 표현은 측정 증거로 사용하지 않았다. flutter_qjs·flujs 등의 추가 후보도 있으나 플랫폼 지원 여부만으로 위 후보보다 우선할 이유는 아직 확인하지 못했다.

## 확인한 구현 세부사항

jsf 1.1.0의 `Runtime.eval/call`은 동기이며 native 구현은 FFI 경로다. 패키지에는 Android NDK/CMake와 iOS CocoaPods 설정이 있다. 해당 설정은 Android minSdk 21, iOS 12.0을 선언하지만, 실제 PatchMap의 최소 OS는 선택한 Flutter SDK·앱·다른 의존성까지 고려해 확정한다. 패키지 선언만으로 그 OS 조합이 검증됐다고 주장하지 않는다.

[jsf의 handle 규칙](https://pub.dev/packages/jsf)은 소유한 handle의 dispose, callback에서 빌린 handle의 유효 범위, 생성 isolate에서의 runtime 사용을 명시한다. `eval()`의 자동 변환은 객체를 Dart 값으로 변환하므로 identity 유지나 zero-copy를 보장하지 않는다. hot path는 함수 handle과 명시적인 batch/buffer 경로를 사용해 복사량·호출 횟수를 측정한다.

quickjs_engine 0.1.5의 배포 archive를 확인했으며 `QuickJsRuntime2.callFunction`의 UnimplementedError와 `convertValue<T>`의 `true as T`가 남아 있다. 새로운 QuickJS-NG를 동봉한다는 사실과 Dart binding 완성도는 별개다. 다른 호출 경로로 보완할 수 있으므로 방식 자체의 불가 판정은 아니다.

fjs 3.3.0의 배포된 `JsEngine.eval/call`은 Future를 반환한다. 이것이 자동으로 느리다는 의미는 아니다. 다만 동기 update 결과와 그 안에서 발생하는 listener 재진입을 기존 계약대로 제공하려면 공개 facade·호출 순서 설계가 필요하다. `flutter_rust_bridge`를 쓴다고 PatchMap 코어를 Rust로 재작성해야 하는 것은 아니다.

[Android 공식 문서](https://developer.android.com/develop/ui/views/layout/webapps/jsengine)에 따르면 Jetpack JavaScriptEngine은 WebView 인스턴스 없이 별도 프로세스에서 JS를 평가한다. Android API 26 이상이면서 시스템 WebView 구현이 이를 지원해야 하며 `isSupported()` 검사가 필요하다. 따라서 화면을 WebView로 그리는 방식은 아니지만, 시스템 WebView 구현에도 의존하지 않으려면 해당 경로를 선택하지 않는다. 공식 문서도 non-interactive evaluation 용도를 설명한다.

## 공통 engine을 쓰는 이점과 한계

Android/iOS에 같은 QuickJS 버전을 동봉하면 언어 기능·engine 버전 차이의 검증 변수를 줄일 수 있다. 그러나 ABI·스레드·메모리·폰트·GPU는 여전히 다르며 동일성을 자동 보장하지 않는다. QuickJS/JSC를 나누는 방식도 동일 conformance를 통과하면 허용한다. 이번 패키지 경로 비교에서 flutter_js가 대량 갱신 준비 시간에 유리했지만, 엔진 자체의 보편적 순위는 아니다.

두 engine 전략 모두 Flutter용 JS 번들과 native renderer를 npm 실행 경로에서 분리할 수 있다. “양쪽 모바일을 지원하려면 npm도 변경해야 한다”거나 “iOS라서 JS 실행이 불가능하다”는 전제는 두지 않는다.

[실측 범위와 실제 buffer 전달 경로](flutter-mobile-benchmark.md)를 함께 확인한다. jsf의 ArrayBuffer API는 내부적으로 tagged JSON을 사용했다. quickjs_engine 0.1.5의 iOS는 native 소스가 pod target에서 빠져 실행에 실패했으며, 벤치마크 앱에서 소스 포함을 보완한 뒤 측정했다. 지원 선언과 빌드 성공만으로 실행 가능성을 확정하지 않는다.

## 비교 완료

세 후보의 [bar slice 벤치마크](flutter-mobile-benchmark.md)를 Android 에뮬레이터와 iOS 시뮬레이터에서 완료했다. quickjs_engine의 iOS 통합 보완과 native 컴파일 최적화 조건을 포함한 결과다. 미측정 대안의 성능 순위를 만들지 않는다.

최종안은 [독립 Dart + 직접 Canvas](flutter-package-design.md)이며 추가 JS 후보 검토를 남기지 않는다. 전체 기능 동등성과 실기기 검증은 선정한 구현의 출시 조건이다.
