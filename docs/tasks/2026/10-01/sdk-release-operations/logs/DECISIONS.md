**2026-10-01**
- 로컬 검사와 workflow가 SDK 버전을 각자 하드코딩했고 service 역할은 로컬에만 있었다.
- toolchains.json을 단일 기준으로 두고 FVM을 동기화 가능한 파생 설정으로 검증한다.
- SDK 이름뿐 아니라 bundled Dart와 공식 framework revision까지 비교해 실행 환경의 잘못된 역할 표시를 막는다.
- CI는 두 역할의 foundation 검증을 수행한다. 네이티브는 baseline만 빌드하며 기능 자격·배포 차단 정책은 바꾸지 않는다.

**2026-10-01**
- 이전 worktree 배포 운영 가이드에는 현재 환경과 다른 workflow 정책 설명이 포함되어 있었다.
- 현재 flutter-package.md owner에 검증된 절차를 선별해 통합하고 registry 성공은 GitHub Release에 별도로 기록하도록 한다.
- qualified compatibility 파일은 게시 상태를 갱신하지 않으며 두 registry 쓰기도 원자적이지 않다. 현재 workflow policy의 path filter를 전역 필수 상태로 만들면 release PR이 멈출 수 있다.
- first upload/재시도/partial success 의미를 명확히 한다. 실제 환경 설정·배포와 foundation 차단 해제는 수행하지 않는다.
