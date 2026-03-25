**2026-03-25**
- 배경: 사용자는 `docs/reference/patchmap`를 중심 증거로 삼되, 언어와 프레임워크에 종속되지 않는 단일 `spec.md`를 요구했다.
- 선택지: 기존 reference 문서를 그대로 확장할지, Spec Kit 구조에 맞는 신규 spec을 만들지, 둘 다 병행할지 검토했다.
- 결정: reference 문서는 근거 자료로 유지하고, Spec Kit 표준 위치인 `specs/001-patchmap-spec/spec.md`에 단일 호환성 명세를 작성한다.
- 영향: 명세는 구현 설명보다 관찰 가능한 계약을 우선시하며, 세부 규칙은 소스와 테스트로 재검증해야 한다.
